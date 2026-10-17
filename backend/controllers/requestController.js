const mongoose = require('mongoose');
const { sendServerError } = require('../utils/errorResponse');
const Ride = require('../models/Ride');
const RideRequest = require('../models/RideRequest');
const RideMatch = require('../models/RideMatch');
const {
  createDepartureDateTime,
  isFutureDeparture,
  calculateExpiration,
  isValidDateString,
  getTodayInAppTimeZone,
  addDaysToDateString,
} = require('../utils/dateHelpers');
const { MAX_DATES_PER_SUBMISSION, SCHEDULE_WINDOW_DAYS, MAX_ACTIVE_FUTURE_ITEMS_PER_USER } =
  require('../utils/rideLimits');
const { countActiveFutureItems } = require('../utils/activeItemCount');
const {
  escapeRegex,
  getVehicleType,
  isVehicleCompatible,
  rankRidesForRequest,
  matchRideToRequest,
} = require('../utils/matching');
const { readOptionalInt } = require('../utils/queryValidation');
const { cascadeCancelForRequest } = require('../utils/matchService');

const SERIES_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const VEHICLES = ['BIKE', 'CAR'];
const PURGE_GRACE_MS = 24 * 60 * 60 * 1000;

const notFound = (res, message = 'Request not found') =>
  res.status(404).json({ success: false, message });
const badRequest = (res, message) => res.status(400).json({ success: false, message });

const firstName = (user) => {
  const n = user && typeof user.name === 'string' ? user.name.trim().split(/\s+/)[0] : '';
  return n || 'Passenger';
};

// Whitelisted owner view (no passenger contact data of any kind)
const ownerView = (doc, now = new Date(), pendingMatchCount = 0) => ({
  id: doc._id,
  pickupLocation: doc.pickupLocation,
  destination: doc.destination,
  requestDate: doc.requestDate,
  departureTime: doc.departureTime,
  departureDateTime: doc.departureDateTime,
  expiresAt: doc.expiresAt,
  vehiclePreference: doc.vehiclePreference,
  passengerCount: doc.passengerCount,
  notes: doc.notes,
  status: RideRequest.deriveStatus(doc, now),
  matchedRide: doc.matchedRide ?? null,
  seriesId: doc.seriesId ?? null,
  pendingMatchCount,
});

// Driver browse view: first name only, no passenger id
const browseView = (doc) => ({
  id: doc._id,
  pickupLocation: doc.pickupLocation,
  destination: doc.destination,
  requestDate: doc.requestDate,
  departureTime: doc.departureTime,
  departureDateTime: doc.departureDateTime,
  vehiclePreference: doc.vehiclePreference,
  passengerCount: doc.passengerCount,
  notes: doc.notes,
  status: 'ACTIVE',
  passenger: { name: firstName(doc.passenger) },
});

const seriesPayload = (docs, seriesId) => {
  const sorted = [...docs].sort((a, b) => (a.requestDate < b.requestDate ? -1 : 1));
  const first = sorted[0];
  return {
    id: first._id,
    status: first.status,
    vehiclePreference: first.vehiclePreference,
    seriesId: seriesId ?? null,
    count: sorted.length,
    requests: sorted.map((r) => ({
      id: r._id,
      requestDate: r.requestDate,
      departureTime: r.departureTime,
      departureDateTime: r.departureDateTime,
      status: r.status,
    })),
  };
};

const pendingCounts = async (ids) => {
  if (ids.length === 0) return new Map();
  const rows = await RideMatch.aggregate([
    { $match: { request: { $in: ids }, status: 'PENDING' } },
    { $group: { _id: '$request', n: { $sum: 1 } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r.n]));
};

// Validates passengerCount for a vehicle; returns { count } or { error }
const resolvePassengerCount = (vehicle, raw) => {
  if (vehicle === 'BIKE') {
    if (raw !== undefined && Number(raw) !== 1) {
      return { error: 'A bike request is for exactly 1 passenger' };
    }
    return { count: 1 };
  }
  const n = raw === undefined ? 1 : Number(raw);
  if (
    !(typeof raw === 'number' || typeof raw === 'string' || raw === undefined) ||
    !Number.isInteger(n) ||
    n < 1 ||
    n > 6
  ) {
    return { error: 'Passenger count must be a whole number between 1 and 6' };
  }
  return { count: n };
};

const checkText = (value, label, max, required) => {
  if (value === undefined || value === null || value === '') {
    return required ? `${label} is required` : null;
  }
  if (typeof value !== 'string') return `${label} must be text`;
  if (value.trim().length > max) return `${label} cannot exceed ${max} characters`;
  if (required && value.trim().length === 0) return `${label} is required`;
  return null;
};

// @desc    Create passenger request(s): one per date
// @route   POST /api/requests
const createRequest = async (req, res) => {
  try {
    const { pickupLocation, destination, departureTime, vehiclePreference, passengerCount, notes } =
      req.body;

    if (typeof vehiclePreference !== 'string' || !VEHICLES.includes(vehiclePreference)) {
      return badRequest(res, 'Vehicle preference must be BIKE or CAR');
    }
    for (const [v, label, max, reqd] of [
      [pickupLocation, 'Pickup location', 100, true],
      [destination, 'Destination', 100, true],
      [notes, 'Notes', 300, false],
    ]) {
      const msg = checkText(v, label, max, reqd);
      if (msg) return badRequest(res, msg);
    }
    const resolved = resolvePassengerCount(vehiclePreference, passengerCount);
    if (resolved.error) return badRequest(res, resolved.error);

    if (typeof departureTime !== 'string' || !TIME_PATTERN.test(departureTime)) {
      return badRequest(res, 'Invalid date or time format provided');
    }
    const { dates: rawDates } = req.body;
    if (!Array.isArray(rawDates)) return badRequest(res, 'Dates must be a list');
    if (rawDates.length === 0 || rawDates.length > MAX_DATES_PER_SUBMISSION) {
      return badRequest(res, `You can request 1 to ${MAX_DATES_PER_SUBMISSION} days at a time`);
    }
    for (const d of rawDates) {
      if (!isValidDateString(d)) {
        return badRequest(res, `Invalid date: ${typeof d === 'string' ? d.slice(0, 20) : 'not a date'}`);
      }
    }
    if (new Set(rawDates).size !== rawDates.length) {
      return badRequest(res, 'Duplicate dates are not allowed');
    }
    const today = getTodayInAppTimeZone();
    const maxDate = addDaysToDateString(today, SCHEDULE_WINDOW_DAYS);
    const futureMsg = 'Departure time must be in the future (at least 5 minutes from now)';
    for (const d of rawDates) {
      if (d < today) {
        return badRequest(res, rawDates.length === 1 ? futureMsg : `Date ${d} is in the past`);
      }
      if (d > maxDate) {
        return badRequest(
          res,
          `Requests can only be scheduled up to 14 days ahead (until ${maxDate})`
        );
      }
      if (!isFutureDeparture(createDepartureDateTime(d, departureTime))) {
        return badRequest(res, rawDates.length === 1 ? futureMsg : `${futureMsg}. Check ${d}`);
      }
    }
    const dates = [...rawDates].sort();

    const { clientRequestId } = req.body;
    if (
      clientRequestId !== undefined &&
      (typeof clientRequestId !== 'string' || !SERIES_ID_PATTERN.test(clientRequestId))
    ) {
      return badRequest(res, 'Invalid request id');
    }
    const seriesId = clientRequestId;

    const replay = async () => {
      const existing = await RideRequest.find({ passenger: req.user._id, seriesId }).sort({
        requestDate: 1,
      });
      return res.status(200).json({
        success: true,
        message: 'Requests already created',
        replayed: true,
        data: seriesPayload(existing, seriesId),
      });
    };

    let missing = dates;
    if (seriesId) {
      const existing = await RideRequest.find({ passenger: req.user._id, seriesId }).select(
        'requestDate'
      );
      const have = new Set(existing.map((r) => r.requestDate));
      missing = dates.filter((d) => !have.has(d));
      if (missing.length === 0) return await replay();
    }

    // Shared cap: upcoming rides + upcoming requests
    const active = await countActiveFutureItems(req.user._id);
    if (active + missing.length > MAX_ACTIVE_FUTURE_ITEMS_PER_USER) {
      return res.status(409).json({
        success: false,
        message: `You can have at most ${MAX_ACTIVE_FUTURE_ITEMS_PER_USER} upcoming rides and requests combined. You have ${active}; this would add ${missing.length}. Cancel some first.`,
      });
    }

    const docs = missing.map((d) => {
      const departureDateTime = createDepartureDateTime(d, departureTime);
      const expiresAt = calculateExpiration(departureDateTime);
      return {
        passenger: req.user._id,
        pickupLocation: pickupLocation.trim(),
        destination: destination.trim(),
        requestDate: d,
        departureTime,
        departureDateTime,
        expiresAt,
        purgeAt: new Date(expiresAt.getTime() + PURGE_GRACE_MS),
        vehiclePreference,
        passengerCount: resolved.count,
        notes: notes ? notes.trim() : '',
        status: 'ACTIVE',
        ...(seriesId ? { seriesId } : {}),
      };
    });

    let inserted;
    try {
      inserted = await RideRequest.insertMany(docs, { ordered: false });
    } catch (err) {
      const codes = (err.writeErrors || []).map((w) => w.err?.code ?? w.code);
      const isDup =
        seriesId &&
        (err.code === 11000 || (codes.length > 0 && codes.every((c) => c === 11000)));
      if (isDup) return await replay();
      throw err;
    }

    const all = seriesId
      ? await RideRequest.find({ passenger: req.user._id, seriesId }).sort({ requestDate: 1 })
      : inserted;
    res.status(201).json({
      success: true,
      message: 'Request posted successfully',
      data: seriesPayload(all, seriesId),
    });
  } catch (error) {
    sendServerError(res, error, 'Server error while creating request');
  }
};

// @desc    The caller's own requests (expired ones stay for 24h, shown as EXPIRED)
// @route   GET /api/requests/mine
const getMyRequests = async (req, res) => {
  try {
    const now = new Date();
    const docs = await RideRequest.find({ passenger: req.user._id, purgeAt: { $gt: now } })
      .sort({ departureDateTime: 1 })
      .lean();
    const counts = await pendingCounts(docs.map((d) => d._id));
    res.status(200).json({
      success: true,
      count: docs.length,
      data: docs.map((d) => ownerView(d, now, counts.get(String(d._id)) || 0)),
    });
  } catch (error) {
    sendServerError(res, error, 'Server error fetching your requests');
  }
};

// @desc    Driver browse: all active, non-expired requests of other users
// @route   GET /api/requests
const getRequests = async (req, res) => {
  try {
    const { date, vehicleType, timeFrom, timeTo } = req.query;
    let { keyword } = req.query;

    if (date !== undefined && date !== '' && !isValidDateString(date)) {
      return badRequest(res, 'Date must be a valid YYYY-MM-DD value');
    }
    if (
      vehicleType !== undefined &&
      vehicleType !== '' &&
      !(typeof vehicleType === 'string' && VEHICLES.includes(vehicleType))
    ) {
      return badRequest(res, 'Vehicle type must be CAR or BIKE');
    }
    for (const t of [timeFrom, timeTo]) {
      if (t !== undefined && t !== '' && !(typeof t === 'string' && TIME_PATTERN.test(t))) {
        return badRequest(res, 'Time must be in HH:mm format');
      }
    }
    if (keyword !== undefined && typeof keyword !== 'string') {
      return badRequest(res, 'Keyword must be text');
    }
    keyword = keyword ? keyword.trim().slice(0, 50) : undefined;

    // P5: `vehicle` is an alias of `vehicleType`; `passengers` = max passengers the driver can seat
    const { vehicle } = req.query;
    if (
      vehicle !== undefined &&
      vehicle !== '' &&
      !(typeof vehicle === 'string' && VEHICLES.includes(vehicle))
    ) {
      return badRequest(res, 'Vehicle must be CAR or BIKE');
    }
    if (vehicle && vehicleType && vehicle !== vehicleType) {
      return badRequest(res, 'Vehicle and vehicle type must agree');
    }
    if (timeFrom && timeTo && timeFrom > timeTo) {
      return badRequest(res, 'Time from cannot be later than time to');
    }
    const passengers = readOptionalInt(req.query.passengers, 1, 6);
    if (!passengers.ok) {
      return badRequest(res, 'Passengers must be a whole number from 1 to 6');
    }

    const now = new Date();
    const query = {
      status: 'ACTIVE',
      expiresAt: { $gt: now },
      passenger: { $ne: req.user._id },
    };
    if (date) query.requestDate = date;
    if (vehicleType || vehicle) query.vehiclePreference = vehicleType || vehicle;
    if (passengers.value) query.passengerCount = { $lte: passengers.value };
    if (timeFrom || timeTo) {
      query.departureTime = {};
      if (timeFrom) query.departureTime.$gte = timeFrom;
      if (timeTo) query.departureTime.$lte = timeTo;
    }
    if (keyword) {
      query.$or = [
        { pickupLocation: { $regex: escapeRegex(keyword), $options: 'i' } },
        { destination: { $regex: escapeRegex(keyword), $options: 'i' } },
      ];
    }

    const docs = await RideRequest.find(query)
      .populate('passenger', 'name')
      .sort({ departureDateTime: 1 })
      .limit(100)
      .lean();

    res.status(200).json({ success: true, count: docs.length, data: docs.map(browseView) });
  } catch (error) {
    sendServerError(res, error, 'Server error fetching requests');
  }
};

const loadRequest = async (id) =>
  mongoose.isValidObjectId(id) && typeof id === 'string' ? RideRequest.findById(id) : null;

// @desc    Single request: owner full view; others only while ACTIVE and not expired
// @route   GET /api/requests/:id
const getRequestById = async (req, res) => {
  try {
    const doc = await loadRequest(req.params.id);
    if (!doc) return notFound(res);
    const now = new Date();
    if (String(doc.passenger) === String(req.user._id)) {
      if (doc.purgeAt <= now) return notFound(res);
      const counts = await pendingCounts([doc._id]);
      return res
        .status(200)
        .json({ success: true, data: ownerView(doc, now, counts.get(String(doc._id)) || 0) });
    }
    if (doc.status !== 'ACTIVE' || doc.expiresAt <= now) return notFound(res);
    await doc.populate('passenger', 'name');
    res.status(200).json({ success: true, data: browseView(doc) });
  } catch (error) {
    sendServerError(res, error, 'Server error fetching request');
  }
};

// @desc    Owner edit while ACTIVE and not expired
// @route   PATCH /api/requests/:id
const updateRequest = async (req, res) => {
  try {
    const doc = await loadRequest(req.params.id);
    if (!doc || String(doc.passenger) !== String(req.user._id)) return notFound(res);

    const body = req.body || {};
    for (const locked of ['status', 'vehiclePreference', 'requestDate', 'matchedRide']) {
      if (body[locked] !== undefined) return badRequest(res, `${locked} cannot be edited`);
    }
    const now = new Date();
    if (doc.expiresAt <= now) {
      return res.status(409).json({ success: false, message: 'This request has expired' });
    }
    if (doc.status !== 'ACTIVE') {
      return res
        .status(409)
        .json({ success: false, message: 'Only active requests can be edited' });
    }

    for (const [k, label, max] of [
      ['pickupLocation', 'Pickup location', 100],
      ['destination', 'Destination', 100],
      ['notes', 'Notes', 300],
    ]) {
      if (body[k] !== undefined) {
        const msg = checkText(body[k], label, max, k !== 'notes');
        if (msg) return badRequest(res, msg);
        doc[k] = body[k].trim();
      }
    }
    if (body.departureTime !== undefined) {
      if (typeof body.departureTime !== 'string' || !TIME_PATTERN.test(body.departureTime)) {
        return badRequest(res, 'Invalid time format provided');
      }
      const dep = createDepartureDateTime(doc.requestDate, body.departureTime);
      if (!isFutureDeparture(dep)) {
        return badRequest(
          res,
          'Departure time must be in the future (at least 5 minutes from now)'
        );
      }
      doc.departureTime = body.departureTime;
      doc.departureDateTime = dep;
      doc.expiresAt = calculateExpiration(dep);
      doc.purgeAt = new Date(doc.expiresAt.getTime() + PURGE_GRACE_MS);
    }
    if (body.passengerCount !== undefined || doc.vehiclePreference === 'BIKE') {
      const r = resolvePassengerCount(doc.vehiclePreference, body.passengerCount);
      if (r.error) return badRequest(res, r.error);
      doc.passengerCount = r.count;
    }

    await doc.save();
    res.status(200).json({ success: true, message: 'Request updated', data: ownerView(doc) });
  } catch (error) {
    sendServerError(res, error, 'Server error updating request');
  }
};

// @desc    Caller's eligible rides for offering on this request
// @route   GET /api/requests/:id/rides-for-offer
const getRidesForOffer = async (req, res) => {
  try {
    const doc = await loadRequest(req.params.id);
    const now = new Date();
    if (
      !doc ||
      String(doc.passenger) === String(req.user._id) ||
      doc.status !== 'ACTIVE' ||
      doc.expiresAt <= now
    ) {
      return notFound(res);
    }
    const query = {
      driver: req.user._id,
      rideDate: doc.requestDate,
      status: 'ACTIVE',
      expiresAt: { $gt: now },
      availableSeats: { $gte: doc.passengerCount },
    };
    if (doc.vehiclePreference === 'BIKE') query.vehicleType = 'BIKE';
    else query.vehicleType = { $ne: 'BIKE' };
    const rides = await Ride.find(query).sort({ departureDateTime: 1 }).lean();
    const prior = await RideMatch.find({
      ride: { $in: rides.map((r) => r._id) },
      passenger: doc.passenger,
      status: { $in: ['PENDING', 'ACCEPTED', 'DECLINED'] },
    })
      .select('ride')
      .lean();
    const offered = new Set(prior.map((m) => String(m.ride)));

    res.status(200).json({
      success: true,
      count: rides.length,
      data: rides
        .filter((r) => isVehicleCompatible(doc.vehiclePreference, r))
        .map((r) => ({
          id: r._id,
          pickupLocation: r.pickupLocation,
          destination: r.destination,
          rideDate: r.rideDate,
          departureTime: r.departureTime,
          availableSeats: r.availableSeats,
          totalSeats: r.totalSeats,
          vehicleType: getVehicleType(r),
          alreadyOffered: offered.has(String(r._id)),
        })),
    });
  } catch (error) {
    sendServerError(res, error, 'Server error fetching eligible rides');
  }
};

const MAX_MATCH_CANDIDATES = 100;
const MAX_COUNT_CANDIDATES = 300;

// @desc    Ranked ride suggestions for the caller's own request (read-only, no contact data)
// @route   GET /api/requests/:id/matches
const getMatchesForRequest = async (req, res) => {
  try {
    const doc = await loadRequest(req.params.id);
    if (!doc || String(doc.passenger) !== String(req.user._id)) return notFound(res);
    const now = new Date();
    if (doc.status !== 'ACTIVE' || doc.expiresAt <= now) {
      return res.status(200).json({
        success: true,
        count: 0,
        data: [],
        reason: 'This request is no longer open for matching',
      });
    }
    const request = doc.toObject();
    const rides = await Ride.find({
      rideDate: doc.requestDate,
      status: 'ACTIVE',
      expiresAt: { $gt: now },
      availableSeats: { $gt: 0 },
      driver: { $ne: req.user._id },
    })
      .select('-whatsappNumber')
      .populate('driver', 'name')
      .sort({ departureDateTime: 1 })
      .limit(MAX_MATCH_CANDIDATES)
      .lean();

    const ranked = rankRidesForRequest(rides, request, now);
    const prior = ranked.length
      ? await RideMatch.find({
          passenger: req.user._id,
          ride: { $in: ranked.map((r) => r.item._id) },
          status: { $in: ['PENDING', 'ACCEPTED'] },
        })
          .select('ride status')
          .lean()
      : [];
    const existing = new Map(prior.map((m) => [String(m.ride), m.status]));

    const data = ranked.map(({ item: r, matchLevel, reasons }) => ({
      ride: {
        id: r._id,
        pickupLocation: r.pickupLocation,
        destination: r.destination,
        rideDate: r.rideDate,
        departureTime: r.departureTime,
        departureDateTime: r.departureDateTime,
        availableSeats: r.availableSeats,
        totalSeats: r.totalSeats,
        vehicleType: getVehicleType(r),
        pricePerSeat: r.pricePerSeat,
        carDetails: r.carDetails,
        driver: { name: firstName(r.driver) },
      },
      matchLevel,
      reasons,
      canLinkRequest: isVehicleCompatible(doc.vehiclePreference, r),
      existingMatch: existing.get(String(r._id)) || null,
    }));
    res.status(200).json({ success: true, count: data.length, data });
  } catch (error) {
    sendServerError(res, error, 'Server error fetching matches');
  }
};

// @desc    "Possible matches (n)" for all of the caller's active requests in one call.
//          Cost: 2 queries total however many requests (max 7 active items per user):
//          1 for the caller's active requests, 1 for candidate rides across their distinct
//          dates (selected fields only, capped at MAX_COUNT_CANDIDATES, indexed on
//          rideDate+status). Matching is then done in memory, so there is no N+1 and it
//          stays light for free-tier Atlas. Past the cap the counts are a lower bound.
// @route   GET /api/requests/matches/counts
const getMatchCounts = async (req, res) => {
  try {
    const now = new Date();
    const requests = await RideRequest.find({
      passenger: req.user._id,
      status: 'ACTIVE',
      expiresAt: { $gt: now },
    }).lean();
    if (requests.length === 0) return res.status(200).json({ success: true, data: {} });

    const dates = [...new Set(requests.map((r) => r.requestDate))];
    const rides = await Ride.find({
      rideDate: { $in: dates },
      status: 'ACTIVE',
      expiresAt: { $gt: now },
      availableSeats: { $gt: 0 },
      driver: { $ne: req.user._id },
    })
      .select('driver pickupLocation destination rideDate departureDateTime availableSeats vehicleType status expiresAt')
      .sort({ departureDateTime: 1 })
      .limit(MAX_COUNT_CANDIDATES)
      .lean();

    const data = {};
    for (const request of requests) {
      let total = 0;
      let exact = 0;
      for (const ride of rides) {
        const m = matchRideToRequest(ride, request, now);
        if (!m) continue;
        total += 1;
        if (m.matchLevel === 'EXACT') exact += 1;
      }
      data[String(request._id)] = { total, exact };
    }
    res.status(200).json({ success: true, data });
  } catch (error) {
    sendServerError(res, error, 'Server error fetching match counts');
  }
};

// @desc    Delete one request (owner); cancels its matches and restores seats
// @route   DELETE /api/requests/:id
const deleteRequest = async (req, res) => {
  try {
    const doc = await loadRequest(req.params.id);
    if (!doc || String(doc.passenger) !== String(req.user._id)) return notFound(res);
    await cascadeCancelForRequest(doc._id);
    await RideRequest.deleteOne({ _id: doc._id });
    res.status(200).json({ success: true, message: 'Request has been cancelled' });
  } catch (error) {
    sendServerError(res, error, 'Server error deleting request');
  }
};

// @desc    Delete all upcoming dates of a series (owner)
// @route   DELETE /api/requests/series/:seriesId
const deleteRequestSeries = async (req, res) => {
  try {
    const { seriesId } = req.params;
    if (!SERIES_ID_PATTERN.test(seriesId)) return badRequest(res, 'Invalid series id');
    const docs = await RideRequest.find({
      passenger: req.user._id,
      seriesId,
      expiresAt: { $gt: new Date() },
    }).select('_id');
    if (docs.length === 0) return notFound(res, 'No upcoming requests found for this series');
    for (const d of docs) await cascadeCancelForRequest(d._id);
    const result = await RideRequest.deleteMany({ _id: { $in: docs.map((d) => d._id) } });
    res.status(200).json({
      success: true,
      message: 'All upcoming dates have been cancelled',
      data: { deletedCount: result.deletedCount },
    });
  } catch (error) {
    sendServerError(res, error, 'Server error deleting request series');
  }
};

module.exports = {
  createRequest,
  getMyRequests,
  getRequests,
  getRequestById,
  updateRequest,
  getRidesForOffer,
  getMatchesForRequest,
  getMatchCounts,
  deleteRequest,
  deleteRequestSeries,
};
