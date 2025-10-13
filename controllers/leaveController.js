const asyncHandler = require('express-async-handler');
const Leave = require('../models/Leave');
const Admin = require('../models/Admin');
const Worker = require('../models/Worker');

// Import the notification service we created
const { sendNewLeaveRequestNotification } = require('../services/notificationService');

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

// @desc    Create a leave application and send notification
// @route   POST /api/leaves
// @access  Private
const createLeave = asyncHandler(async (req, res) => {
  const { subdomain, leaveType, startDate, endDate, totalDays, reason } = req.body;

  if (!subdomain || subdomain === 'main') {
    res.status(400);
    throw new Error('Company name is required, login again.');
  }

  if (!leaveType || !startDate || !endDate || !totalDays || !reason) {
    res.status(400);
    throw new Error('Please fill in all required fields');
  }

  const documentDoc = req.file ? req.file.filename : '';

  const leave = await Leave.create({
    worker: req.user._id,
    subdomain,
    leaveType,
    startDate,
    endDate,
    totalDays,
    reason,
    document: req.file ? req.file.filename : '',
    status: 'Pending',
    workerViewed: false
  });
  
  // Send WhatsApp notification
  if (leave) {
    console.log('Sending WhatsApp notification for leave:', leave._id);
    
    sendNewLeaveRequestNotification(leave)
      .then(result => {
        if (result.success) {
          console.log('✅ Leave notification sent successfully, Message ID:', result.messageId);
        } else {
          console.error('❌ Failed to send leave notification:', result.error);
        }
      })
      .catch(error => {
        console.error('❌ Error sending leave notification:', error.message);
      });
  }

  res.status(201).json(leave);
});

// (The rest of your controller file remains the same)

const updateLeaveStatus = asyncHandler(async (req, res) => {
  const { status, leaveData } = req.body;

  if (!status || !['Approved', 'Rejected'].includes(status)) {
    res.status(400);
    throw new Error('Please provide a valid status');
  }

  const leave = await Leave.findById(req.params.id);
  if (!leave) {
    res.status(404);
    throw new Error('Leave application not found');
  }

  const updatedLeave = await Leave.findByIdAndUpdate(
    req.params.id,
    {
      status,
      workerViewed: false
    },
    { new: true }
  );

  if (status === 'Approved') {
    const workerId = leaveData.worker?._id;
    const totalDays = leaveData.totalDays;

    if (!workerId || !totalDays) {
      res.status(400);
      throw new Error('Incomplete leave data for salary update');
    }

    const worker = await Worker.findById(workerId);
    if (!worker) {
      res.status(404);
      throw new Error('Worker not found');
    }

    const deduction = totalDays * worker.perDaySalary;
    const updatedFinalSalary = Math.max(0, worker.finalSalary - deduction);

    await Worker.updateOne(
      { _id: workerId },
      { $set: { finalSalary: updatedFinalSalary } }
    );
  }

  res.json(updatedLeave);
});

const getLeavesByStatus = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const query = status !== 'all' ? { status } : {};
  const leaves = await Leave.find(query)
    .populate('worker', 'name department')
    .sort({ createdAt: -1 });
  res.json(leaves);
});

const markLeaveAsViewed = asyncHandler(async (req, res) => {
  const leave = await Leave.findById(req.params.id);
  if (!leave) {
    res.status(404);
    throw new Error('Leave application not found');
  }
  if (leave.worker.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error('Not authorized to mark this leave as viewed');
  }
  leave.workerViewed = true;
  await leave.save();
  res.json({ message: 'Leave marked as viewed' });
});

const getLeavesByDateRange = asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;
  if (!startDate || !endDate) {
    res.status(400);
    throw new Error('Please provide start and end dates');
  }
  const leaves = await Leave.find({
    $or: [
      { startDate: { $gte: new Date(startDate), $lte: new Date(endDate) } },
      { endDate: { $gte: new Date(startDate), $lte: new Date(endDate) } }
    ]
  })
    .populate('worker', 'name department')
    .sort({ createdAt: -1 });
  res.json(leaves);
});

const markLeavesAsViewedByAdmin = asyncHandler(async (req, res) => {
  await Leave.updateMany({ workerViewed: false }, { workerViewed: true });
  res.json({ message: 'All leaves marked as viewed by admin' });
});

module.exports = {
  getLeaves,
  getMyLeaves,
  createLeave,
  updateLeaveStatus,
  getLeavesByStatus,
  markLeaveAsViewed,
  markLeavesAsViewedByAdmin,
  getLeavesByDateRange
};
