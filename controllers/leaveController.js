const asyncHandler = require('express-async-handler');
const Leave = require('../models/Leave');
const Admin = require('../models/Admin');
const Worker = require('../models/Worker');

// Make sure to import the notification service
const { sendNewLeaveRequestNotification } = require('../services/notificationService');

// @desc    Get all leave applications (for Admin) or own leaves (for Worker)
// @route   GET /api/leaves/:subdomain/:me
// @access  Private
const getLeaves = asyncHandler(async (req, res) => {
  const { subdomain, me } = req.params;

  if (!['1', '0'].includes(me)) {
    res.status(404);
    throw new Error('URL not found');
  }

  if (!subdomain || subdomain === 'main') {
    res.status(400);
    throw new Error("Company name is missing, login again.");
  }

  let leaves;

  if (me === '1') { // '1' means worker is fetching their own leaves
    leaves = await Leave.find({ worker: req.user._id }).sort({ createdAt: -1 });
  } else if (me === '0') { // '0' means admin is fetching all leaves for the subdomain
    const user = await Admin.findById(req.user._id);
    if (user) {
      leaves = await Leave.find({ subdomain })
        .populate('worker', 'name department')
        .sort({ createdAt: -1 });
    } else {
      res.status(403);
      throw new Error("Access denied. Admin access required.");
    }
  }

  res.status(200).json(leaves);
});

// @desc    Get my leave applications (dedicated route for workers)
// @route   GET /api/leaves/me
// @access  Private (Worker)
const getMyLeaves = asyncHandler(async (req, res) => {
  const leaves = await Leave.find({ worker: req.user._id }).sort({ createdAt: -1 });
  res.status(200).json(leaves);
});

// @desc    Create a new leave application and send WhatsApp notification
// @route   POST /api/leaves
// @access  Private (Worker)
const createLeave = asyncHandler(async (req, res) => {
  const { leaveType, startDate, endDate, totalDays, reason, startTime, endTime, subdomain } = req.body;

  // Basic validation
  if (!leaveType || !startDate || !endDate || !reason || !subdomain) {
    res.status(400);
    throw new Error('Please provide all required fields');
  }

  // If the leave type is 'Permission', startTime and endTime become mandatory
  if (leaveType === 'Permission' && (!startTime || !endTime)) {
    res.status(400);
    throw new Error('Start Time and End Time are required for Permission leave');
  }

  const document = req.file ? req.file.filename : null;

  // Create the leave object in the database
  const leave = await Leave.create({
    worker: req.user._id,
    subdomain,
    leaveType,
    startDate,
    endDate,
    totalDays: totalDays || 0,
    reason,
    document,
    // CRITICAL: Save startTime and endTime only if the leaveType is 'Permission'
    startTime: leaveType === 'Permission' ? startTime : null,
    endTime: leaveType === 'Permission' ? endTime : null,
    status: 'Pending',
    workerViewed: false
  });

  // After successfully creating the leave, send the notification
  if (leave) {
    console.log(`Leave created. Sending WhatsApp notification for leave ID: ${leave._id}`);
    
    sendNewLeaveRequestNotification(leave)
      .then(result => {
        if (result.success) {
          console.log(`✅ Leave notification sent successfully. Summary: ${result.summary}`);
        } else {
          console.error(`❌ Failed to send leave notification: ${result.error}`);
        }
      })
      .catch(error => {
        console.error(`❌ An unexpected error occurred while sending notification: ${error.message}`);
      });
  }

  res.status(201).json(leave);
});

// @desc    Update leave status (admin only)
// @route   PUT /api/leaves/:id/status
// @access  Private/Admin
const updateLeaveStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  const leaveId = req.params.id;

  if (!['Approved', 'Rejected'].includes(status)) {
    res.status(400);
    throw new Error('Invalid status provided.');
  }

  const leave = await Leave.findById(leaveId);
  if (!leave) {
    res.status(404);
    throw new Error('Leave application not found.');
  }

  // Update the leave status
  const updatedLeave = await Leave.findByIdAndUpdate(
    leaveId,
    { status: status, workerViewed: false }, // Mark as unread for the worker
    { new: true }
  ).populate('worker', 'name');

  // Optional: Handle salary deduction for approved leaves if applicable
  if (status === 'Approved') {
    const worker = await Worker.findById(leave.worker);
    if (worker) {
      let deduction = 0;
      if (leave.leaveType === 'Permission' && leave.startTime && leave.endTime) {
        // Example deduction logic for permissions (can be adjusted)
        const start = new Date(`1970-01-01T${leave.startTime}:00`);
        const end = new Date(`1970-01-01T${leave.endTime}:00`);
        const durationHours = (end - start) / (1000 * 60 * 60);
        const perHourSalary = worker.perDaySalary / 8; // Assuming an 8-hour workday
        deduction = durationHours * perHourSalary;
      } else {
        // Deduction for full-day leaves
        deduction = leave.totalDays * worker.perDaySalary;
      }

      worker.finalSalary = Math.max(0, worker.finalSalary - deduction);
      await worker.save();
    }
  }

  res.status(200).json(updatedLeave);
});

// @desc    Filter leaves by status
// @route   GET /api/leaves/status
// @access  Private/Admin
const getLeavesByStatus = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const query = status && status !== 'all' ? { status } : {};
  
  // Also filter by subdomain for security
  query.subdomain = req.user.subdomain;

  const leaves = await Leave.find(query)
    .populate('worker', 'name department')
    .sort({ createdAt: -1 });

  res.status(200).json(leaves);
});

// @desc    Mark a leave as viewed by the worker
// @route   PUT /api/leaves/:id/viewed
// @access  Private (Worker)
const markLeaveAsViewed = asyncHandler(async (req, res) => {
  const leave = await Leave.findById(req.params.id);

  if (!leave) {
    res.status(404);
    throw new Error('Leave application not found.');
  }

  // Ensure the worker is marking their own leave
  if (leave.worker.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error('Not authorized to perform this action.');
  }

  leave.workerViewed = true;
  await leave.save();
  res.status(200).json({ message: 'Leave marked as viewed' });
});

// @desc    Get leaves within a specific date range
// @route   GET /api/leaves/range
// @access  Private/Admin
const getLeavesByDateRange = asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;
  if (!startDate || !endDate) {
    res.status(400);
    throw new Error('Please provide both start and end dates.');
  }

  const leaves = await Leave.find({
    subdomain: req.user.subdomain, // Filter by subdomain
    $or: [
      { startDate: { $gte: new Date(startDate), $lte: new Date(endDate) } },
      { endDate: { $gte: new Date(startDate), $lte: new Date(endDate) } }
    ]
  })
    .populate('worker', 'name department')
    .sort({ createdAt: -1 });

  res.status(200).json(leaves);
});

// @desc    Mark all leaves as viewed by admin (utility function)
// @route   PUT /api/leaves/mark-viewed-by-admin
// @access  Private/Admin
const markLeavesAsViewedByAdmin = asyncHandler(async (req, res) => {
  await Leave.updateMany(
    { subdomain: req.user.subdomain, workerViewed: false },
    { $set: { workerViewed: true } }
  );
  res.status(200).json({ message: 'All leaves marked as viewed by admin' });
});


module.exports = {
  getLeaves,
  getMyLeaves,
  createLeave,
  updateLeaveStatus,
  getLeavesByStatus,
  markLeaveAsViewed,
  getLeavesByDateRange,
  markLeavesAsViewedByAdmin
};