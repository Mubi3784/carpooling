const RoadStatus = require('../models/RoadStatus');

// @desc    Get all road statuses (Public)
// @route   GET /api/road-status
// @access  Public
const getRoadStatuses = async (req, res) => {
  try {
    const { category, keyword } = req.query;

    let query = {};
    if (category && category !== 'All') {
      query.category = category;
    }
    if (keyword) {
      query.roadName = { $regex: keyword, $options: 'i' };
    }

    const roads = await RoadStatus.find(query).lean();

    // Priority sorting: CLOSED (1) -> RESTRICTED (2) -> OPEN (3), then by newest updatedAt
    const statusWeight = {
      CLOSED: 1,
      RESTRICTED: 2,
      OPEN: 3,
    };

    roads.sort((a, b) => {
      const weightA = statusWeight[a.status] || 99;
      const weightB = statusWeight[b.status] || 99;

      if (weightA !== weightB) {
        return weightA - weightB;
      }
      return new Date(b.updatedAt) - new Date(a.updatedAt);
    });

    res.status(200).json({
      success: true,
      count: roads.length,
      data: roads.map((r) => ({
        id: r._id,
        roadName: r.roadName,
        status: r.status,
        category: r.category,
        description: r.description,
        updatedAt: r.updatedAt,
      })),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Error fetching road status updates',
    });
  }
};

// @desc    Create a new road status entry (Admin only)
// @route   POST /api/road-status
// @access  Private/Admin
const createRoadStatus = async (req, res) => {
  try {
    const { roadName, status, category, description } = req.body;

    if (!roadName || !status) {
      return res.status(400).json({
        success: false,
        message: 'Please provide road name and status',
      });
    }

    const road = await RoadStatus.create({
      roadName: roadName.trim(),
      status,
      category: category || 'Twin Cities',
      description: description ? description.trim() : '',
      updatedBy: req.user._id,
    });

    res.status(201).json({
      success: true,
      message: 'Road status published successfully',
      data: road,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Error creating road status',
    });
  }
};

// @desc    Update existing road status (Admin only)
// @route   PUT /api/road-status/:id
// @access  Private/Admin
const updateRoadStatus = async (req, res) => {
  try {
    const { roadName, status, category, description } = req.body;

    const road = await RoadStatus.findById(req.params.id);
    if (!road) {
      return res.status(404).json({
        success: false,
        message: 'Road update not found',
      });
    }

    if (roadName) road.roadName = roadName.trim();
    if (status) road.status = status;
    if (category) road.category = category;
    if (description !== undefined) road.description = description.trim();
    road.updatedBy = req.user._id;

    // save() automatically refreshes the updatedAt timestamp
    await road.save();

    res.status(200).json({
      success: true,
      message: 'Road status updated successfully',
      data: road,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Error updating road status',
    });
  }
};

// @desc    Delete a road status (Admin only)
// @route   DELETE /api/road-status/:id
// @access  Private/Admin
const deleteRoadStatus = async (req, res) => {
  try {
    const road = await RoadStatus.findById(req.params.id);
    if (!road) {
      return res.status(404).json({
        success: false,
        message: 'Road update not found',
      });
    }

    await RoadStatus.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Road status removed successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Error deleting road status',
    });
  }
};

module.exports = {
  getRoadStatuses,
  createRoadStatus,
  updateRoadStatus,
  deleteRoadStatus,
};