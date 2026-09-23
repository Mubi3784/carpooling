const Ride = require('../models/Ride');
const {
  createDepartureDateTime,
  isFutureDeparture,
  calculateExpiration,
} = require('../utils/dateHelpers');
const {
  sanitizePhoneNumber,
  isValidPhoneNumber,
} = require('../utils/phoneSanitizer');

// @desc    Create / Offer a new ride
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
      pricePerSeat,
      whatsappNumber,
      genderPreference,
      carDetails,
      notes,
    } = req.body;

    // 1. Check required fields
    if (
      !pickupLocation ||
      !destination ||
      !rideDate ||
      !departureTime ||
      availableSeats === undefined ||
      pricePerSeat === undefined ||
      !whatsappNumber
    ) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required ride information',
      });
    }

    // 2. Validate available seats range (1 to 6)
    const seats = Number(availableSeats);
    if (isNaN(seats) || seats < 1 || seats > 6) {
      return res.status(400).json({
        success: false,
        message: 'Available seats must be between 1 and 6',
      });
    }

    // 3. Validate price (cannot be negative)
    const price = Number(pricePerSeat);
    if (isNaN(price) || price < 0) {
      return res.status(400).json({
        success: false,
        message: 'Price per seat cannot be negative',
      });
    }

    // 4. Validate and sanitize phone number
    if (!isValidPhoneNumber(whatsappNumber)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid WhatsApp phone number',
      });
    }
    const cleanPhone = sanitizePhoneNumber(whatsappNumber);

    // 5. Combine and validate departure date/time
    const departureDateTime = createDepartureDateTime(rideDate, departureTime);
    if (isNaN(departureDateTime.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date or time format provided',
      });
    }

    if (!isFutureDeparture(departureDateTime)) {
      return res.status(400).json({
        success: false,
        message: 'Departure time must be in the future (at least 5 minutes from now)',
      });
    }

    // 6. Calculate expiration timestamp (departure + 15 minutes)
    const expiresAt = calculateExpiration(departureDateTime);

    // 7. Save ride into database
    const ride = await Ride.create({
      driver: req.user._id,
      pickupLocation: pickupLocation.trim(),
      destination: destination.trim(),
      rideDate,
      departureTime,
      departureDateTime,
      availableSeats: seats,
      totalSeats: seats,
      pricePerSeat: price,
      whatsappNumber: cleanPhone,
      genderPreference: genderPreference || 'Anyone',
      carDetails: carDetails ? carDetails.trim() : '',
      notes: notes ? notes.trim() : '',
      status: 'ACTIVE',
      expiresAt,
    });

    res.status(201).json({
      success: true,
      message: 'Ride offered successfully',
      data: {
        id: ride._id,
        status: ride.status,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Server error while creating ride',
    });
  }
};

// @desc    Get all active rides (feed) with optional date and keyword filters
// @route   GET /api/rides
// @access  Public
const getRides = async (req, res) => {
  try {
    const { date, keyword } = req.query;

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

    // Keyword filter (searches pickup or destination)
    if (keyword) {
      query.$or = [
        { pickupLocation: { $regex: keyword,$options: 'i' } },
        { destination: { $regex: keyword,$options: 'i' } },
      ];
    }

    const rides = await Ride.find(query)
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
    res.status(500).json({
      success: false,
      message: error.message || 'Server error fetching rides',
    });
  }
};

// @desc    Get single ride details by ID
// @route   GET /api/rides/:id
// @access  Public (Enhanced for logged-in users)
const getRideById = async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.id)
      .populate('driver', 'name email createdAt')
      .lean();

    if (!ride) {
      return res.status(404).json({
        success: false,
        message: 'Ride not found or has already departed',
      });
    }

    // Check if requester is logged in
    const isAuthenticated = !!req.user;

    // Generate WhatsApp pre-filled message
    let whatsappLink = null;
    let whatsappNumber = null;

    if (isAuthenticated) {
      whatsappNumber = ride.whatsappNumber;
      const driverName = ride.driver?.name || 'Driver';
      const message = `Hi ${driverName}, I saw your ride on Carpool from ${ride.pickupLocation} to ${ride.destination} on ${ride.rideDate} at ${ride.departureTime}. Are seats still available?`;
      whatsappLink = `https://wa.me/${ride.whatsappNumber}?text=${encodeURIComponent(message)}`;
    }

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
        pricePerSeat: ride.pricePerSeat,
        genderPreference: ride.genderPreference,
        carDetails: ride.carDetails,
        notes: ride.notes,
        status: ride.status,
        canContact: isAuthenticated,
        whatsappNumber,
        whatsappLink,
        driver: {
          id: ride.driver?._id,
          name: ride.driver?.name || 'Unknown Driver',
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Server error fetching ride details',
    });
  }
};

// @desc    Get rides created by currently logged-in driver
// @route   GET /api/rides/my-rides
// @access  Private
const getMyRides = async (req, res) => {
  try {
    const rides = await Ride.find({ driver: req.user._id })
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
        pricePerSeat: ride.pricePerSeat,
        status: ride.status,
        genderPreference: ride.genderPreference,
        carDetails: ride.carDetails,
        notes: ride.notes,
      })),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Server error fetching your rides',
    });
  }
};

// @desc    Quickly update available seats (Driver only)
// @route   PATCH /api/rides/:id/seats
// @access  Private
const updateSeats = async (req, res) => {
  try {
    const { availableSeats } = req.body;

    const seats = Number(availableSeats);
    if (isNaN(seats) || seats < 0 || seats > 6) {
      return res.status(400).json({
        success: false,
        message: 'Available seats must be a number between 0 and 6',
      });
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
        status: ride.status,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Server error updating seats',
    });
  }
};

// @desc    Cancel & permanently delete a ride (Driver only)
// @route   DELETE /api/rides/:id
// @access  Private
const deleteRide = async (req, res) => {
  try {
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

    // Hard delete to free storage immediately
    await Ride.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Ride has been successfully deleted',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Server error deleting ride',
    });
  }
};

module.exports = {
  createRide,
  getRides,
  getRideById,
  getMyRides,
  updateSeats,
  deleteRide,
};