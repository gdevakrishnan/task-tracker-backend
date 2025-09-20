const asyncHandler = require('express-async-handler');
const Leave = require('../models/Leave');
const Admin = require('../models/Admin');
const Worker = require('../models/Worker');

// @desc    Get all leave applications
// @route   GET /api/leaves
// @access  Private/Admin
const getLeaves = asyncHandler(async (req, res) => {
  const { subdomain, me } = req.params;

  if (!(me == '1' || me == '0')) {
    throw new Error('URL not found');
  }

  if (!subdomain || subdomain == 'main') {
    res.status(400);
    throw new Error("Company name is missing, login again.");
  }

  let leaves;

  if (me == '1') {
    leaves = await Leave.find({ worker: req.user._id })
      .sort({ createdAt: -1 });
  } else if (me == '0') {
    let user = await Admin.findById(req.user._id).select('-password');
    if (user) {
      leaves = await Leave.find({ subdomain })
        .populate('worker', 'name department')
        .sort({ createdAt: -1 });
    } else {
      res.status(400).json({ "message": "access denied" });
    }
  }

  res.json(leaves);
});

// @desc    Get my leave applications
// @route   GET /api/leaves/me
// @access  Private
const getMyLeaves = asyncHandler(async (req, res) => {
  console.log(req.user._id);
  const leaves = await Leave.find({ worker: req.user._id })
    .sort({ createdAt: -1 });

  res.json(leaves);
});

const createLeave = asyncHandler(async (req, res) => {
  const { leaveType, startDate, endDate, totalDays, reason, startTime, endTime, subdomain } = req.body;
  const worker = req.user._id; // Use req.user._id instead of req.worker.id
  const document = req.file ? `/uploads/documents/${req.file.filename}` : null;

  // Validate required fields
  if (!leaveType || !startDate || !endDate || !reason) {
    res.status(400);
    throw new Error('Please add all required fields');
  }

  // Validate subdomain
  if (!subdomain || subdomain === 'main') {
    res.status(400);
    throw new Error('Valid subdomain is required');
  }

  // Validate worker role
  if (req.user.role !== 'worker') {
    res.status(403);
    throw new Error('Only workers can create leave requests');
  }

  const leave = await Leave.create({
    worker,
    subdomain,
    leaveType,
    startDate,
    endDate,
    totalDays: totalDays || 0,
    reason,
    document,
    startTime: leaveType === 'Permission' ? startTime : undefined,
    endTime: leaveType === 'Permission' ? endTime : undefined
  });

  // Create notification for admin (if Notification model exists)
  try {
    const Notification = require('../models/Notification');
    await Notification.create({
      type: 'leave_request',
      recipient: 'admin',
      subdomain,
      message: `${req.user.name} submitted a leave request.`,
      relatedId: leave._id,
      isRead: false
    });
  } catch (error) {
    console.log('Notification creation failed:', error.message);
    // Continue without failing the leave creation
  }

  res.status(201).json(leave);
});


// @desc    Update leave status (admin only)
// @route   PUT /api/leaves/:id/status
// @access  Private/Admin
const updateLeaveStatus = asyncHandler(async (req, res) => {
  const leaveId = req.params.id;
  const { status, reason } = req.body;
  const leaveData = await Leave.findById(leaveId);

  if (!leaveData) {
    res.status(404);
    throw new Error('Leave not found');
  }

  const updatedLeave = await Leave.findByIdAndUpdate(
    leaveId, { status }, { new: true }
  ).populate('worker', 'name username');

  if (status === 'Approved') {
    const workerId = leaveData.worker;
    const worker = await Worker.findById(workerId);
    if (worker) {
      let deduction = 0;
      if (leaveData.leaveType === 'Permission') {
        const start = new Date(`${leaveData.startDate.toISOString().split('T')[0]}T${leaveData.startTime}:00Z`);
        const end = new Date(`${leaveData.endDate.toISOString().split('T')[0]}T${leaveData.endTime}:00Z`);
        const durationMinutes = (end - start) / (1000 * 60);
        const dailyWorkMinutes = 8 * 60;
        const perMinuteSalary = (worker.perDaySalary || (worker.salary / 30)) / dailyWorkMinutes;
        deduction = durationMinutes * perMinuteSalary;
      } else {
        // Existing logic for full days
        deduction = leaveData.totalDays * worker.perDaySalary;
      }

      worker.finalSalary = Math.max(0, worker.finalSalary - deduction);
      await worker.save();
    }
  }

  const workerNotification = await Notification.create({
    type: 'leave_status_update',
    recipient: 'worker',
    subdomain: leaveData.subdomain,
    message: `Your leave request has been ${status.toLowerCase()}.`,
    relatedId: leaveData._id,
    isRead: false
  });

  emailNotification({
    to: leaveData.worker.email,
    subject: `Your Leave Request Status Update`,
    text: `Your leave request from ${leaveData.startDate.toDateString()} to ${leaveData.endDate.toDateString()} has been ${status.toLowerCase()}.`
  });

  res.json(updatedLeave);
});

const getLeavesByStatus = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const subdomain = req.user.subdomain; // Get subdomain from authenticated user

  // Build query with subdomain filter
  const query = { subdomain };
  if (status !== 'all') {
    query.status = status;
  }

  const leaves = await Leave.find(query)
    .populate('worker', 'name department')
    .sort({ createdAt: -1 });

  res.json(leaves);
});

// @desc    Mark leave as viewed by worker
// @route   PUT /api/leaves/:id/viewed
// @access  Private
const markLeaveAsViewed = asyncHandler(async (req, res) => {
  const leave = await Leave.findById(req.params.id);

  if (!leave) {
    res.status(404);
    throw new Error('Leave application not found');
  }

  // Ensure worker can only mark their own leave
  if (leave.worker.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error('Not authorized to mark this leave as viewed');
  }

  leave.workerViewed = true;

  await leave.save();

  res.json({ message: 'Leave marked as viewed' });
});

// @desc    Get leave applications by date range
// @route   GET /api/leaves/range
// @access  Private/Admin
const getLeavesByDateRange = asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;
  const subdomain = req.user.subdomain; // Get subdomain from authenticated user

  if (!startDate || !endDate) {
    res.status(400);
    throw new Error('Please provide start and end dates');
  }

  const leaves = await Leave.find({
    subdomain, // Add subdomain filter
    $or: [
      {
        startDate: {
          $gte: new Date(startDate),
          $lte: new Date(endDate)
        }
      },
      {
        endDate: {
          $gte: new Date(startDate),
          $lte: new Date(endDate)
        }
      }
    ]
  })
    .populate('worker', 'name department')
    .sort({ createdAt: -1 });

  res.json(leaves);
});

const markLeavesAsViewedByAdmin = asyncHandler(async (req, res) => {
  const subdomain = req.user.subdomain; // Get subdomain from authenticated user
  
  await Leave.updateMany(
    {
      subdomain, // Add subdomain filter
      workerViewed: false
    },
    {
      workerViewed: true
    }
  );

  res.json({ message: 'All leaves marked as viewed by admin' });
});

const getAdminLeaves = asyncHandler(async (req, res) => {
  const subdomain = req.subdomain;
  const leaves = await Leave.find({ subdomain }).populate('worker', 'name username').sort({ createdAt: -1 });
  res.json(leaves);
});

const getWorkerLeaves = asyncHandler(async (req, res) => {
  const worker = req.worker.id;
  const leaves = await Leave.find({ worker }).sort({ createdAt: -1 });
  res.json(leaves);
});

const viewLeave = asyncHandler(async (req, res) => {
  const leave = await Leave.findById(req.params.id);

  if (!leave) {
    res.status(404);
    throw new Error('Leave not found');
  }

  leave.workerViewed = true;
  await leave.save();
  res.json({ message: 'Leave marked as viewed' });
});


module.exports = {
  getLeaves,
  getMyLeaves,
  createLeave,
  updateLeaveStatus,
  getLeavesByStatus,
  markLeaveAsViewed,
  markLeavesAsViewedByAdmin,
  getLeavesByDateRange,
  viewLeave,
  getAdminLeaves,
  getWorkerLeaves,
};