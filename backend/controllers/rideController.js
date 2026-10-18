const { sendServerError } = require('../utils/errorResponse');
const Ride = require('../models/Ride');
const {
  createDepartureDateTime,
  isFutureDeparture,
  calculateExpiration,
  isValidDateString,
  getTodayInAppTimeZone,
  addDaysToDateString,
} = require('../utils/dateHelpers');
const {
  MAX_ACTIVE_FUTURE_ITEMS_PER_USER,
  MAX_DATES_PER_SUBMISSION,
  SCHEDULE_WINDOW_DAYS,
} = require('../utils/rideLimits');
const { countActiveFutureItems } = require('../utils/activeItemCount');
const { cascadeCancelForRide } = require('../utils/matchService');
const chatHooks = require('../utils/chatHooks');

const mongoose = require('mongoose');
const RideRequest = require('../models/RideRequest');
const RideMatch = require('../models/RideMatch');
const { escapeRegex, rankRequestsForRide, isVehicleCompatible } = require('../utils/matching');
const {
  MAX_FILTER_TEXT,
  readOptionalString,
  readOptionalTime,
  readOptionalInt,
} = require('../utils/queryValidation');

const VEHICLE_TYPES = ['CAR', 'BIKE'];
const isValidVehicleType = (v) => typeof v === 'string' && VEHICLE_TYPES.includes(v);
const getVehicleType = (ride) => ride.vehicleType ?? 'CAR'; // old docs / .lean() lack the field
const {
  sanitizePhoneNumber,
  isValidPhoneNumber,
} = require('../utils/phoneSanitizer');

// clientRequestId doubles as seriesId: UUID-like, 8-64 chars
const SERIES_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

// Response shape for a created/replayed set of rides. id/status/vehicleType are the
// first ride's, which keeps the old single-ride client contract.
const seriesPayload = (rides, seriesId) => {
  const sorted = [...rides].sort((a, b) => (a.rideDate < b.rideDate ? -1 : 1));
  const first = sorted[0];
  return {
    id: first._id,
    status: first.status,
    vehicleType: getVehicleType(first),
    seriesId: seriesId ?? null,
    count: sorted.length,
    rides: sorted.map((r) => ({
      id: r._id,
      rideDate: r.rideDate,
      departureTime: r.departureTime,
      departureDateTime: r.departureDateTime,
      status: r.status,
    })),
  };
};

// @desc    Create / Offer new ride(s): one ride per date
// @route   POST /api/rides
// @access  Private (Requires Login)
const createRide = async (req, res) => {
  try {
    const {
      pickupLocation,
      destination,
      rideDate,
      departureTime,
      availableSeats,
      totalSeats,
      vehicleType,
      pricePerSeat,
      whatsappNumber,
      genderPreference,
      carDetails,
      notes,
    } = req.body;

    if (vehicleType !== undefined && !isValidVehicleType(vehicleType)) {
      return res.status(400).json({
        success: false,
        message: 'Vehicle type must be CAR or BIKE',
      });
    }
    const type = vehicleType ?? 'CAR';

    // 1. Check required fields
    if (
      !pickupLocation ||
      !destination ||
      (req.body.dates === undefined && !rideDate) ||
      !departureTime ||
      (type === 'CAR' && availableSeats === undefined) ||
      pricePerSeat === undefined
    ) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required ride information',
      });
    }

    // 2. Validate seats: car 1 to 6, bike always exactly 1
    let seats;
    if (type === 'BIKE') {
      if (
        (availableSeats !== undefined && Number(availableSeats) !== 1) ||
        (totalSeats !== undefined && Number(totalSeats) !== 1)
      ) {
        return res.status(400).json({
          success: false,
          message: 'A bike ride can carry only 1 passenger',
        });
      }
      seats = 1;
    } else {
      seats = Number(availableSeats);
      if (isNaN(seats) || seats < 1 || seats > 6) {
        return res.status(400).json({
          success: false,
          message: 'Available seats must be between 1 and 6',
        });
      }
    }
    // 3. Validate price (cannot be negative)
    const price = Number(pricePerSeat);
    if (isNaN(price) || price < 0) {
      return res.status(400).json({
        success: false,
        message: 'Price per seat cannot be negative',
      });
    }

    // 4. Optional private number (driver's own use; never returned by any endpoint)
    const hasPhone = typeof whatsappNumber === 'string' && whatsappNumber.trim() !== '';
    if (whatsappNumber !== undefined && whatsappNumber !== null && whatsappNumber !== '') {
      if (!hasPhone || !isValidPhoneNumber(whatsappNumber)) {
        return res.status(400).json({
          success: false,
          message: 'Please provide a valid WhatsApp phone number',
        });
      }
    }
    const cleanPhone = hasPhone ? sanitizePhoneNumber(whatsappNumber) : undefined;

    // 5. Resolve and validate dates (entered as Pakistan time)
    let dates;
    if (req.body.dates !== undefined) {
      if (!Array.isArray(req.body.dates)) {
        return res.status(400).json({ success: false, message: 'Dates must be a list' });
      }
      dates = req.body.dates;
    } else {
      dates = [rideDate];
    }
    if (dates.length === 0 || dates.length > MAX_DATES_PER_SUBMISSION) {
      return res.status(400).json({
        success: false,
        message: `You can post 1 to ${MAX_DATES_PER_SUBMISSION} days at a time`,
      });
    }
    if (typeof departureTime !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(departureTime)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date or time format provided',
      });
    }
    for (const d of dates) {
      if (!isValidDateString(d)) {
        return res.status(400).json({
          success: false,
          message: `Invalid date: ${typeof d === 'string' ? d.slice(0, 20) : 'not a date'}`,
        });
      }
    }
    if (new Set(dates).size !== dates.length) {
      return res.status(400).json({ success: false, message: 'Duplicate dates are not allowed' });
    }
    const today = getTodayInAppTimeZone();
    const maxDate = addDaysToDateString(today, SCHEDULE_WINDOW_DAYS);
    const futureMsg = 'Departure time must be in the future (at least 5 minutes from now)';
    for (const d of dates) {
      if (d < today) {
        return res.status(400).json({
          success: false,
          message: dates.length === 1 ? futureMsg : `Date ${d} is in the past`,
        });
      }
      if (d > maxDate) {
        return res.status(400).json({
          success: false,
          message: `Rides can only be scheduled up to 14 days ahead (until ${maxDate})`,
        });
      }
      if (!isFutureDeparture(createDepartureDateTime(d, departureTime))) {
        return res.status(400).json({
          success: false,
          message: dates.length === 1 ? futureMsg : `${futureMsg}. Check ${d}`,
        });
      }
    }
    dates = [...dates].sort();

    // 6. Idempotency key (scoped to this driver by the unique index)
    const { clientRequestId } = req.body;
    if (
      clientRequestId !== undefined &&
      (typeof clientRequestId !== 'string' || !SERIES_ID_PATTERN.test(clientRequestId))
    ) {
      return res.status(400).json({ success: false, message: 'Invalid request id' });
    }
    const seriesId = clientRequestId;

    const replay = async () => {
      const existing = await Ride.find({ driver: req.user._id, seriesId }).sort({ rideDate: 1 });
      return res.status(200).json({
        success: true,
        message: 'Rides already created',
        replayed: true,
        data: seriesPayload(existing, seriesId),
      });
    };

    let missing = dates;
    if (seriesId) {
      const existing = await Ride.find({ driver: req.user._id, seriesId }).select('rideDate');
      const have = new Set(existing.map((r) => r.rideDate));
      missing = dates.filter((d) => !have.has(d));
      if (missing.length === 0) return await replay();
    }

    // 7. Per-user cap on upcoming rides
    // (P3: shared with passenger requests: rides + requests count together)
    const active = await countActiveFutureItems(req.user._id);
    if (active + missing.length > MAX_ACTIVE_FUTURE_ITEMS_PER_USER) {
      return res.status(409).json({
        success: false,
        message: `You can have at most ${MAX_ACTIVE_FUTURE_ITEMS_PER_USER} upcoming rides and requests combined. You have ${active}; this would add ${missing.length}. Cancel some first.`,
      });
    }

    // 8. Save one ride per date
    const docs = missing.map((d) => {
      const departureDateTime = createDepartureDateTime(d, departureTime);
      return {
        driver: req.user._id,
        pickupLocation: pickupLocation.trim(),
        destination: destination.trim(),
        rideDate: d,
        departureTime,
        departureDateTime,
        availableSeats: seats,
        totalSeats: seats,
        vehicleType: type,
        pricePerSeat: price,
        ...(cleanPhone ? { whatsappNumber: cleanPhone } : {}),
        genderPreference: genderPreference || 'Anyone',
        carDetails: carDetails ? carDetails.trim() : '',
        notes: notes ? notes.trim() : '',
        status: 'ACTIVE',
        expiresAt: calculateExpiration(departureDateTime),
        timeShiftedAt: new Date(),
        ...(seriesId ? { seriesId } : {}),
      };
    });

    let inserted;
    try {
      inserted = await Ride.insertMany(docs, { ordered: false });
    } catch (err) {
      const codes = (err.writeErrors || []).map((w) => w.err?.code ?? w.code);
      const isDup =
        seriesId &&
        (err.code === 11000 || (codes.length > 0 && codes.every((c) => c === 11000)));
      if (isDup) return await replay();
      throw err;
    }

    const all = seriesId
      ? await Ride.find({ driver: req.user._id, seriesId }).sort({ rideDate: 1 })
      : inserted;
    res.status(201).json({
      success: true,
      message: 'Ride offered successfully',
      data: seriesPayload(all, seriesId),
    });
  } catch (error) {
    sendServerError(res, error, 'Server error while creating ride');
  }
};

// @desc    Get all active rides (feed) with optional date and keyword filters
// @route   GET /api/rides
// @access  Public
const getRides = async (req, res) => {
  try {
    const { date } = req.query;
    let { keyword, vehicleType } = req.query;

    // Reject non-string / malformed dates (blocks ?date[$ne]=x operator injection)
    if (date !== undefined && date !== '' && !isValidDateString(date)) {
      return res.status(400).json({
        success: false,
        message: 'Date must be a valid YYYY-MM-DD value',
      });
    }
    if (vehicleType !== undefined && vehicleType !== '' && !isValidVehicleType(vehicleType)) {
      return res.status(400).json({
        success: false,
        message: 'Vehicle type must be CAR or BIKE',
      });
    }
    // Keywords must be plain strings; ignore anything else
    if (typeof keyword !== 'string') keyword = undefined;
    keyword = keyword ? keyword.trim().slice(0, 50) : undefined;

    // P5 filters: strictly validated (arrays/objects/over-long -> 400)
    const timeFrom = readOptionalTime(req.query.timeFrom);
    const timeTo = readOptionalTime(req.query.timeTo);
    if (!timeFrom.ok || !timeTo.ok) {
      return res.status(400).json({ success: false, message: 'Time must be in HH:mm format' });
    }
    if (timeFrom.value && timeTo.value && timeFrom.value > timeTo.value) {
      return res
        .status(400)
        .json({ success: false, message: 'Time from cannot be later than time to' });
    }
    const minSeats = readOptionalInt(req.query.minSeats, 1, 6);
    if (!minSeats.ok) {
      return res
        .status(400)
        .json({ success: false, message: 'Minimum seats must be a whole number from 1 to 6' });
    }
    const pickup = readOptionalString(req.query.pickup);
    const destination = readOptionalString(req.query.destination);
    if (!pickup.ok || !destination.ok) {
      return res.status(400).json({
        success: false,
        message: `Pickup and destination must be text of at most ${MAX_FILTER_TEXT} characters`,
      });
    }

    // Filter criteria: active status and non-expired departure time
    let query = {
      status: 'ACTIVE',
      departureDateTime: { $gt: new Date(Date.now() - 15 * 60 * 1000) },
      availableSeats: { $gt: 0 },
    };

    // Date filter (e.g. ?date=2026-09-23)
    if (date) {
      query.rideDate = date;
    }

    // Vehicle filter: old docs lack the field, so CAR means "not BIKE"
    if (vehicleType === 'BIKE') query.vehicleType = 'BIKE';
    else if (vehicleType === 'CAR') query.vehicleType = { $ne: 'BIKE' };

    // Keyword filter (searches pickup or destination)
    if (keyword) {
      query.$or = [
        { pickupLocation: { $regex: escapeRegex(keyword), $options: 'i' } },
        { destination: { $regex: escapeRegex(keyword), $options: 'i' } },
      ];
    }

    if (timeFrom.value || timeTo.value) {
      query.departureTime = {};
      if (timeFrom.value) query.departureTime.$gte = timeFrom.value;
      if (timeTo.value) query.departureTime.$lte = timeTo.value;
    }
    if (minSeats.value) query.availableSeats = { $gte: minSeats.value };
    // $and keeps the keyword's $or intact
    const textClauses = [];
    if (pickup.value) {
      textClauses.push({ pickupLocation: { $regex: escapeRegex(pickup.value), $options: 'i' } });
    }
    if (destination.value) {
      textClauses.push({ destination: { $regex: escapeRegex(destination.value), $options: 'i' } });
    }
    if (textClauses.length) query.$and = textClauses;

    const rides = await Ride.find(query)
      .select('-whatsappNumber')
      .populate('driver', 'name')
      .sort({ departureDateTime: 1 })
      .lean();

    // Map output: hide plain contact number for unauthenticated guests
    const formattedRides = rides.map((ride) => ({
      id: ride._id,
      pickupLocation: ride.pickupLocation,
      destination: ride.destination,
      rideDate: ride.rideDate,
      departureTime: ride.departureTime,
      departureDateTime: ride.departureDateTime,
      availableSeats: ride.availableSeats,
      totalSeats: ride.totalSeats,
      vehicleType: getVehicleType(ride),
      pricePerSeat: ride.pricePerSeat,
      genderPreference: ride.genderPreference,
      carDetails: ride.carDetails,
      driver: {
        id: ride.driver?._id,
        name: ride.driver?.name || 'Unknown Driver',
      },
    }));

    res.status(200).json({
      success: true,
      count: formattedRides.length,
      data: formattedRides,
    });
  } catch (error) {
    sendServerError(res, error, 'Server error fetching rides');
  }
};

// @desc    Get single ride details by ID
// @route   GET /api/rides/:id
// @access  Public (Enhanced for logged-in users)
const getRideById = async (req, res) => {
  try {
    if (typeof req.params.id !== 'string' || !mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ success: false, message: 'Ride not found' });
    }
    const ride = await Ride.findById(req.params.id)
      .populate('driver', 'name')
      .select('-whatsappNumber')
      .lean();

    // Read-time expiry check (TTL deletion may lag by a minute or more)
    if (!ride || ride.expiresAt <= new Date()) {
      return res.status(404).json({
        success: false,
        message: 'Ride not found or has already departed',
      });
    }

    // Check if requester is logged in
    const isAuthenticated = !!req.user;

    res.status(200).json({
      success: true,
      data: {
        id: ride._id,
        pickupLocation: ride.pickupLocation,
        destination: ride.destination,
        rideDate: ride.rideDate,
        departureTime: ride.departureTime,
        departureDateTime: ride.departureDateTime,
        availableSeats: ride.availableSeats,
        totalSeats: ride.totalSeats,
        vehicleType: getVehicleType(ride),
        pricePerSeat: ride.pricePerSeat,
        genderPreference: ride.genderPreference,
        carDetails: ride.carDetails,
        notes: ride.notes,
        status: ride.status,
        canContact: isAuthenticated,
        driver: {
          id: ride.driver?._id,
          name: ride.driver?.name || 'Unknown Driver',
        },
      },
    });
  } catch (error) {
    sendServerError(res, error, 'Server error fetching ride details');
  }
};

// @desc    Get rides created by currently logged-in driver
// @route   GET /api/rides/my-rides
// @access  Private
const getMyRides = async (req, res) => {
  try {
    const rides = await Ride.find({ driver: req.user._id })
      .select('-whatsappNumber')
      .sort({ departureDateTime: -1 })
      .lean();

    res.status(200).json({
      success: true,
      count: rides.length,
      data: rides.map((ride) => ({
        id: ride._id,
        pickupLocation: ride.pickupLocation,
        destination: ride.destination,
        rideDate: ride.rideDate,
        departureTime: ride.departureTime,
        departureDateTime: ride.departureDateTime,
        availableSeats: ride.availableSeats,
        totalSeats: ride.totalSeats,
        vehicleType: getVehicleType(ride),
        pricePerSeat: ride.pricePerSeat,
        status: ride.status,
        seriesId: ride.seriesId ?? null,
        genderPreference: ride.genderPreference,
        carDetails: ride.carDetails,
        notes: ride.notes,
      })),
    });
  } catch (error) {
    sendServerError(res, error, 'Server error fetching your rides');
  }
};

// @desc    Quickly update available seats (Driver only)
// @route   PATCH /api/rides/:id/seats
// @access  Private
const updateSeats = async (req, res) => {
  try {
    const { availableSeats } = req.body;

    const seats =
      typeof availableSeats === 'number' || typeof availableSeats === 'string'
        ? Number(availableSeats)
        : NaN;
    if (!Number.isInteger(seats) || seats < 0 || seats > 6) {
      return res.status(400).json({
        success: false,
        message: 'Available seats must be a whole number between 0 and 6',
      });
    }

    if (typeof req.params.id !== 'string' || !mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ success: false, message: 'Ride not found' });
    }
    const ride = await Ride.findById(req.params.id);

    if (!ride) {
      return res.status(404).json({
        success: false,
        message: 'Ride not found',
      });
    }

    // Verify ownership
    if (ride.driver.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this ride',
      });
    }

    if (ride.expiresAt <= new Date()) {
      return res.status(404).json({
        success: false,
        message: 'Ride not found or has already departed',
      });
    }

    const isBike = ride.vehicleType === 'BIKE';
    if (seats > (isBike ? 1 : ride.totalSeats)) {
      return res.status(400).json({
        success: false,
        message: isBike
          ? 'A bike ride has only 1 seat'
          : `Available seats cannot exceed total seats (${ride.totalSeats})`,
      });
    }

    ride.availableSeats = seats;
    // If seats reach 0, mark as FULL; otherwise revert to ACTIVE
    ride.status = seats === 0 ? 'FULL' : 'ACTIVE';

    await ride.save();

    res.status(200).json({
      success: true,
      message: 'Seats updated successfully',
      data: {
        id: ride._id,
        availableSeats: ride.availableSeats,
        vehicleType: getVehicleType(ride),
        status: ride.status,
      },
    });
  } catch (error) {
    sendServerError(res, error, 'Server error updating seats');
  }
};

// @desc    Cancel & permanently delete a ride (Driver only)
// @route   DELETE /api/rides/:id
// @access  Private
const deleteRide = async (req, res) => {
  try {
    if (typeof req.params.id !== 'string' || !mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ success: false, message: 'Ride not found' });
    }
    const ride = await Ride.findById(req.params.id);

    if (!ride) {
      return res.status(404).json({
        success: false,
        message: 'Ride not found',
      });
    }

    // Verify ownership
    if (ride.driver.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this ride',
      });
    }

    // Cancel PENDING/ACCEPTED matches and reopen linked requests so nothing dangles
    await cascadeCancelForRide(ride._id);

    // Hard delete to free storage immediately
    await Ride.findByIdAndDelete(req.params.id);
    await chatHooks.purgeChatsForRides([ride._id]); // belt and braces after the cascade

    res.status(200).json({
      success: true,
      message: 'Ride has been successfully deleted',
    });
  } catch (error) {
    sendServerError(res, error, 'Server error deleting ride');
  }
};

// @desc    Cancel all upcoming dates of one series (Driver only)
// @route   DELETE /api/rides/series/:seriesId
// @access  Private
const deleteRideSeries = async (req, res) => {
  try {
    const { seriesId } = req.params;
    if (!SERIES_ID_PATTERN.test(seriesId)) {
      return res.status(400).json({ success: false, message: 'Invalid series id' });
    }

    // Scoped to the owner, so other users' series are indistinguishable from missing
    const filter = { driver: req.user._id, seriesId, expiresAt: { $gt: new Date() } };
    const targets = await Ride.find(filter).select('_id');
    for (const t of targets) await cascadeCancelForRide(t._id);
    const result = await Ride.deleteMany({ _id: { $in: targets.map((t) => t._id) } });
    await chatHooks.purgeChatsForRides(targets.map((t) => t._id));

    if (result.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'No upcoming rides found for this series',
      });
    }

    res.status(200).json({
      success: true,
      message: 'All upcoming dates have been cancelled',
      data: { deletedCount: result.deletedCount },
    });
  } catch (error) {
    sendServerError(res, error, 'Server error deleting ride series');
  }
};

// @desc    Passenger requests that could fit the caller's own ride (read-only, no contact data)
// @route   GET /api/rides/:id/matching-requests
// @access  Private (ride owner only; everyone else gets 404)
const getMatchingRequests = async (req, res) => {
  try {
    const id = req.params.id;
    const ride =
      mongoose.isValidObjectId(id) && typeof id === 'string' ? await Ride.findById(id).lean() : null;
    if (!ride || String(ride.driver) !== String(req.user._id)) {
      return res.status(404).json({ success: false, message: 'Ride not found' });
    }
    const now = new Date();
    if (ride.status !== 'ACTIVE' || ride.expiresAt <= now || ride.availableSeats <= 0) {
      return res.status(200).json({
        success: true,
        count: 0,
        data: [],
        reason: 'This ride is no longer open for matching',
      });
    }

    const requests = await RideRequest.find({
      requestDate: ride.rideDate,
      status: 'ACTIVE',
      expiresAt: { $gt: now },
      passenger: { $ne: req.user._id },
    })
      .populate('passenger', 'name')
      .limit(100)
      .lean();

    const ranked = rankRequestsForRide(
      requests.filter((r) => r.passenger),
      ride,
      now
    );
    const prior = ranked.length
      ? await RideMatch.find({
          ride: ride._id,
          passenger: { $in: ranked.map((r) => r.item.passenger._id) },
          status: { $in: ['PENDING', 'ACCEPTED'] },
        })
          .select('passenger status')
          .lean()
      : [];
    const existing = new Map(prior.map((m) => [String(m.passenger), m.status]));

    const data = ranked.map(({ item, matchLevel, reasons }) => {
      const name =
        item.passenger && typeof item.passenger.name === 'string'
          ? item.passenger.name.trim().split(/\s+/)[0]
          : '';
      return {
        id: item._id,
        pickupLocation: item.pickupLocation,
        destination: item.destination,
        requestDate: item.requestDate,
        departureTime: item.departureTime,
        departureDateTime: item.departureDateTime,
        vehiclePreference: item.vehiclePreference,
        passengerCount: item.passengerCount,
        notes: item.notes,
        status: 'ACTIVE',
        passenger: { name: name || 'Passenger' },
        matchLevel,
        reasons,
        canOffer: isVehicleCompatible(item.vehiclePreference, ride),
        existingMatch: existing.get(String(item.passenger._id)) || null,
      };
    });

    res.status(200).json({ success: true, count: data.length, data });
  } catch (error) {
    sendServerError(res, error, 'Server error fetching matching requests');
  }
};

module.exports = {
  getMatchingRequests,
  createRide,
  deleteRideSeries,
  getRides,
  getRideById,
  getMyRides,
  updateSeats,
  deleteRide,
};
