const mongoose = require('mongoose');
const { sendServerError } = require('../utils/errorResponse');
const Ride = require('../models/Ride');
const RideRequest = require('../models/RideRequest');
const RideMatch = require('../models/RideMatch');
const chatHooks = require('../utils/chatHooks');
const push = require('../utils/push');
const { checkOfferEligibility, getVehicleType } = require('../utils/matching');
const matchService = require('../utils/matchService');

const { cancelMatchInternal } = matchService;

const ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
const BOXES = ['incoming', 'outgoing'];
const STATUSES = ['PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED'];

const send = (res, status, message) => res.status(status).json({ success: false, message });
const isId = (v) => typeof v === 'string' && mongoose.isValidObjectId(v);
const firstName = (user) => {
  const n = user && typeof user.name === 'string' ? user.name.trim().split(/\s+/)[0] : '';
  return n || null;
};

const roleOf = (match, userId) => {
  const u = String(userId);
  if (String(match.driver?._id ?? match.driver) === u) return 'DRIVER';
  if (String(match.passenger?._id ?? match.passenger) === u) return 'PASSENGER';
  return null;
};
// The responder is the party that did NOT initiate
const responderRole = (match) => (match.initiatedBy === 'DRIVER' ? 'PASSENGER' : 'DRIVER');

// Field-by-field whitelist. Counterpart is a first name only (never id/email/phone).
const buildMatchView = (m, viewerId, now = new Date()) => {
  const role = roleOf(m, viewerId);
  const isResponder = role === responderRole(m);
  const expired = m.expiresAt <= now;
  const live = !expired;
  const counterpart = role === 'DRIVER' ? m.passenger : m.driver;
  const ride = m.ride && m.ride._id ? m.ride : null;
  const request = m.request && m.request._id ? m.request : null;
  return {
    id: m._id,
    status: m.status === 'PENDING' && expired ? 'EXPIRED' : m.status,
    initiatedBy: m.initiatedBy,
    role,
    direction: isResponder ? 'incoming' : 'outgoing',
    passengerCount: m.passengerCount,
    createdAt: m.createdAt,
    respondedAt: m.respondedAt,
    expiresAt: m.expiresAt,
    unread: role === 'DRIVER' ? !m.seenByDriver : !m.seenByPassenger,
    canAccept: live && m.status === 'PENDING' && isResponder,
    canDecline: live && m.status === 'PENDING' && isResponder,
    canCancel: live && ((m.status === 'PENDING' && !isResponder) || m.status === 'ACCEPTED'),
    counterpart: { name: firstName(counterpart) || (role === 'DRIVER' ? 'Passenger' : 'Driver') },
    ride: ride && {
      id: ride._id,
      pickupLocation: ride.pickupLocation,
      destination: ride.destination,
      rideDate: ride.rideDate,
      departureTime: ride.departureTime,
      vehicleType: getVehicleType(ride),
      availableSeats: ride.availableSeats,
    },
    request: request && {
      id: request._id,
      pickupLocation: request.pickupLocation,
      destination: request.destination,
      requestDate: request.requestDate,
      departureTime: request.departureTime,
      vehiclePreference: request.vehiclePreference,
      passengerCount: request.passengerCount,
      notes: request.notes,
    },
  };
};

const populateForView = (query) =>
  query
    .populate('ride', 'pickupLocation destination rideDate departureTime vehicleType availableSeats')
    .populate('request', 'pickupLocation destination requestDate departureTime vehiclePreference passengerCount notes')
    .populate('passenger', 'name')
    .populate('driver', 'name');

const viewById = async (id, userId) => {
  const m = await populateForView(RideMatch.findById(id)).lean();
  return m ? buildMatchView(m, userId) : null;
};

// Loads a match the caller participates in; otherwise answers 404 and returns null
const loadParticipantMatch = async (req, res) => {
  const { id } = req.params;
  const match = isId(id) ? await RideMatch.findById(id) : null;
  const role = match ? roleOf(match, req.user._id) : null;
  if (!match || !role) {
    send(res, 404, 'Offer or request not found');
    return null;
  }
  return { match, role };
};

// @desc    Create a match: driver offers (Flow A) or passenger asks to join (Flow B)
// @route   POST /api/matches
const createMatch = async (req, res) => {
  try {
    const { rideId, requestId, passengerCount, clientMatchId } = req.body || {};
    if (!isId(rideId)) return send(res, 400, 'A valid ride is required');
    if (requestId !== undefined && !isId(requestId)) return send(res, 400, 'Invalid request');
    if (typeof clientMatchId !== 'string' || !ID_PATTERN.test(clientMatchId)) {
      return send(res, 400, 'Invalid match id');
    }

    const now = new Date();
    const ride = await Ride.findById(rideId);
    if (!ride || ride.status === 'CANCELLED' || ride.expiresAt <= now) {
      return send(res, 404, 'Ride not found or has already departed');
    }

    const callerId = String(req.user._id);
    const isDriver = String(ride.driver) === callerId;
    let request = null;
    let count;
    let passengerId;
    let initiatedBy;

    if (isDriver) {
      // Flow A: offer my ride on a passenger request
      initiatedBy = 'DRIVER';
      if (!requestId) return send(res, 400, 'A request is required to make an offer');
      request = await RideRequest.findById(requestId);
      if (!request || request.status !== 'ACTIVE' || request.expiresAt <= now) {
        return send(res, 404, 'Request not found or no longer active');
      }
      if (String(request.passenger) === callerId) {
        return send(res, 400, 'You cannot offer a ride to yourself');
      }
      count = request.passengerCount;
      passengerId = request.passenger;
    } else {
      // Flow B: ask to join someone else's ride
      initiatedBy = 'PASSENGER';
      passengerId = req.user._id;
      if (requestId) {
        request = await RideRequest.findById(requestId);
        if (!request || String(request.passenger) !== callerId) {
          return send(res, 404, 'Request not found');
        }
        count = request.passengerCount;
      } else if (passengerCount === undefined) {
        count = 1;
      } else {
        count = Number(passengerCount);
        if (
          !(typeof passengerCount === 'number' || typeof passengerCount === 'string') ||
          !Number.isInteger(count) ||
          count < 1 ||
          count > 6
        ) {
          return send(res, 400, 'Passenger count must be a whole number between 1 and 6');
        }
      }
    }

    // Idempotent replay (before eligibility so a retry after the seats fill still works)
    const replay = await RideMatch.findOne({
      ride: ride._id,
      passenger: passengerId,
      initiatedBy,
      clientMatchId,
    });
    if (replay) {
      const view = await viewById(replay._id, req.user._id);
      return res.status(200).json({ success: true, replayed: true, data: view });
    }

    const declined = await RideMatch.exists({
      ride: ride._id,
      passenger: passengerId,
      status: 'DECLINED',
    });
    if (declined) {
      return send(res, 409, 'This offer was declined and cannot be sent again for this ride');
    }

    const check = checkOfferEligibility({ ride, request, passengerCount: count, now });
    if (!check.ok) return send(res, check.status, check.message);

    let created;
    try {
      created = await RideMatch.create({
        ride: ride._id,
        request: request ? request._id : null,
        passenger: passengerId,
        driver: ride.driver,
        initiatedBy,
        passengerCount: count,
        status: 'PENDING',
        clientMatchId,
        expiresAt: ride.expiresAt,
        // initiator has seen it; the other party has an unseen alert
        seenByDriver: initiatedBy === 'DRIVER',
        seenByPassenger: initiatedBy === 'PASSENGER',
      });
    } catch (err) {
      if (err && err.code === 11000) {
        return send(res, 409, 'There is already a pending or accepted offer for this ride');
      }
      throw err;
    }

    await push.notifyUser(initiatedBy === 'DRIVER' ? passengerId : ride.driver, 'offer');
    const view = await viewById(created._id, req.user._id);
    res.status(201).json({ success: true, message: 'Sent', data: view });
  } catch (error) {
    sendServerError(res, error, 'Server error creating offer');
  }
};

// @desc    Inbox: matches the caller takes part in
// @route   GET /api/matches
const listMatches = async (req, res) => {
  try {
    const { box, status } = req.query;
    if (box !== undefined && box !== '' && !(typeof box === 'string' && BOXES.includes(box))) {
      return send(res, 400, 'Invalid box');
    }
    if (
      status !== undefined &&
      status !== '' &&
      !(typeof status === 'string' && STATUSES.includes(status))
    ) {
      return send(res, 400, 'Invalid status');
    }
    const me = req.user._id;
    const now = new Date();
    const base = { expiresAt: { $gt: now } };
    let participant;
    if (box === 'incoming') {
      participant = [
        { driver: me, initiatedBy: 'PASSENGER' },
        { passenger: me, initiatedBy: 'DRIVER' },
      ];
    } else if (box === 'outgoing') {
      participant = [
        { driver: me, initiatedBy: 'DRIVER' },
        { passenger: me, initiatedBy: 'PASSENGER' },
      ];
    } else {
      participant = [{ driver: me }, { passenger: me }];
    }
    const query = { ...base, $or: participant };
    if (status) query.status = status;

    const matches = await populateForView(RideMatch.find(query).sort({ createdAt: -1 }).limit(100))
      .lean();
    res.status(200).json({
      success: true,
      count: matches.length,
      data: matches.map((m) => buildMatchView(m, me, now)),
    });
  } catch (error) {
    sendServerError(res, error, 'Server error fetching offers');
  }
};

// @desc    Responder accepts: atomic seat reservation, never oversells
// @route   POST /api/matches/:id/accept
const acceptMatch = async (req, res) => {
  try {
    const found = await loadParticipantMatch(req, res);
    if (!found) return;
    const { match, role } = found;
    if (role !== responderRole(match)) {
      return send(res, 403, 'Only the other party can accept this');
    }
    const now = new Date();
    if (match.status !== 'PENDING') return send(res, 409, `This offer is already ${match.status.toLowerCase()}`);
    if (match.expiresAt <= now) return send(res, 409, 'This ride has already departed');

    const ride = await Ride.findById(match.ride);
    if (!ride || ride.status === 'CANCELLED' || ride.expiresAt <= now) {
      // Nothing to wait for
      await cancelMatchInternal(match, role, { restore: false });
      return send(res, 409, 'This ride is no longer available');
    }
    if (match.request) {
      const r = await RideRequest.findById(match.request).select('status expiresAt');
      if (!r || r.status !== 'ACTIVE' || r.expiresAt <= now) {
        return send(res, 409, 'The linked request is no longer active');
      }
    }

    // 1. Reserve seats FIRST (atomic). On failure the match stays PENDING and is never
    //    visible as ACCEPTED (it may be acceptable later if seats free up).
    const updatedRide = await matchService.reserveSeats(match.ride, match.passengerCount);
    if (!updatedRide) {
      return send(res, 409, 'Sorry, there are not enough seats left on this ride');
    }

    // 2. Claim PENDING -> ACCEPTED. If it fails, give the reserved seats back.
    let claimed;
    try {
      claimed = await matchService.claimMatch(match._id, role);
    } catch (err) {
      await matchService.restoreSeats(match.ride, match.passengerCount);
      throw err;
    }
    if (!claimed) {
      await matchService.restoreSeats(match.ride, match.passengerCount);
      return send(res, 409, 'This offer was already answered');
    }

    // 3. LAST step: mark the linked request MATCHED; compensate if it cannot be done
    if (match.request) {
      const rollback = async () => {
        const back = await RideMatch.findOneAndUpdate(
          { _id: match._id, status: 'ACCEPTED', seatsReserved: true },
          {
            $set: {
              status: 'PENDING',
              seatsReserved: false,
              respondedAt: null,
              seenByDriver: match.seenByDriver,
              seenByPassenger: match.seenByPassenger,
            },
          }
        );
        // Only credit if we won the rollback (a concurrent cancel credits on its own)
        if (back) await matchService.restoreSeats(match.ride, match.passengerCount);
      };
      let r;
      try {
        r = await RideRequest.updateOne(
          { _id: match.request, status: 'ACTIVE', expiresAt: { $gt: new Date() } },
          { $set: { status: 'MATCHED', matchedRide: match.ride } }
        );
      } catch (err) {
        await rollback();
        throw err;
      }
      if (r.matchedCount === 0) {
        await rollback();
        return send(res, 409, 'The linked request is no longer active');
      }
    }

    try {
      await chatHooks.createChatForMatch(claimed);
    } catch (err) {
      // Never roll back an accepted match because the chat failed to open
      console.error('Chat creation failed:', err.message);
    }
    await push.notifyUser(match.initiatedBy === 'DRIVER' ? match.driver : match.passenger, 'update');
    const view = await viewById(match._id, req.user._id);
    res.status(200).json({ success: true, message: 'Accepted. A seat is reserved.', data: view });
  } catch (error) {
    sendServerError(res, error, 'Server error accepting offer');
  }
};

// @desc    Responder declines (request is left unchanged)
// @route   POST /api/matches/:id/decline
const declineMatch = async (req, res) => {
  try {
    const found = await loadParticipantMatch(req, res);
    if (!found) return;
    const { match, role } = found;
    if (role !== responderRole(match)) {
      return send(res, 403, 'Only the other party can decline this');
    }
    if (match.expiresAt <= new Date()) return send(res, 409, 'This ride has already departed');
    const updated = await RideMatch.findOneAndUpdate(
      { _id: match._id, status: 'PENDING' },
      {
        $set: {
          status: 'DECLINED',
          respondedAt: new Date(),
          seenByDriver: role === 'DRIVER',
          seenByPassenger: role === 'PASSENGER',
        },
      },
      { new: true }
    );
    if (!updated) return send(res, 409, 'This offer was already answered');
    await push.notifyUser(match.initiatedBy === 'DRIVER' ? match.driver : match.passenger, 'update');
    const view = await viewById(match._id, req.user._id);
    res.status(200).json({ success: true, message: 'Declined', data: view });
  } catch (error) {
    sendServerError(res, error, 'Server error declining offer');
  }
};

// @desc    Initiator cancels PENDING; either party cancels ACCEPTED (before expiry)
// @route   POST /api/matches/:id/cancel
const cancelMatch = async (req, res) => {
  try {
    const found = await loadParticipantMatch(req, res);
    if (!found) return;
    const { match, role } = found;
    if (match.expiresAt <= new Date()) return send(res, 409, 'This ride has already departed');
    if (match.status === 'PENDING' && role === responderRole(match)) {
      return send(res, 403, 'Only the sender can cancel a pending offer. You can decline it.');
    }
    if (match.status !== 'PENDING' && match.status !== 'ACCEPTED') {
      return send(res, 409, `This offer is already ${match.status.toLowerCase()}`);
    }
    const previous = await cancelMatchInternal(match, role);
    if (!previous) return send(res, 409, 'This offer was already settled');
    const view = await viewById(match._id, req.user._id);
    res.status(200).json({ success: true, message: 'Cancelled', data: view });
  } catch (error) {
    sendServerError(res, error, 'Server error cancelling offer');
  }
};

const unseenFilter = (me) => ({
  expiresAt: { $gt: new Date() },
  $or: [
    { driver: me, seenByDriver: false },
    { passenger: me, seenByPassenger: false },
  ],
});

// @desc    Alert badge: pending-for-me plus unseen status changes
// @route   GET /api/matches/alerts/count
const getAlertCount = async (req, res) => {
  try {
    const count = await RideMatch.countDocuments(unseenFilter(req.user._id));
    res.status(200).json({ success: true, data: { count } });
  } catch (error) {
    sendServerError(res, error, 'Server error fetching alerts');
  }
};

// @desc    Mark my side of a match as seen
// @route   POST /api/matches/:id/seen
const markSeen = async (req, res) => {
  try {
    const found = await loadParticipantMatch(req, res);
    if (!found) return;
    const { match, role } = found;
    await RideMatch.updateOne(
      { _id: match._id },
      { $set: role === 'DRIVER' ? { seenByDriver: true } : { seenByPassenger: true } }
    );
    res.status(200).json({ success: true });
  } catch (error) {
    sendServerError(res, error, 'Server error updating alert');
  }
};

module.exports = {
  createMatch,
  listMatches,
  acceptMatch,
  declineMatch,
  cancelMatch,
  getAlertCount,
  markSeen,
};
