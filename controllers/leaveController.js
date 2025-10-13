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

// @desc    Create a leave application
// @route   POST /api/leaves
// @access  Private
const createLeave = asyncHandler(async (req, res) => {
  const { subdomain, leaveType, startDate, endDate, totalDays, reason } = req.body;

  console.log('REQ BODY:', req.body);
  console.log('REQ FILE:', req.file);

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
    document: documentDoc,
    status: 'Pending',
    workerViewed: false
  });

  res.status(201).json(leave);
});


// (The rest of your controller file remains the same)

const updateLeaveStatus = asyncHandler(async (req, res) => {
  const { status, leaveData } = req.body;

  // Validate status
  if (!status || !['Approved', 'Rejected'].includes(status)) {
    res.status(400);
    throw new Error('Please provide a valid status');
  }

  // Check if leave exists
  const leave = await Leave.findById(req.params.id);
  if (!leave) {
    res.status(404);
    throw new Error('Leave not found');
  }

  const updatedLeave = await Leave.findByIdAndUpdate(
    req.params.id,
    {
      status,
      workerViewed: false
    },
    { new: true } // Return the updated document
  ).populate('worker', 'name department'); // Populate worker info in the response

  // If approved, update the worker's final salary
  if (status === 'Approved') {
    const workerId = leaveData.worker;
    const worker = await Worker.findById(workerId);
    if (!worker) {
      res.status(404);
      throw new Error('Worker not found');
    }

    const deduction = totalDays * worker.perDaySalary;
    const updatedFinalSalary = Math.max(0, worker.finalSalary - deduction);

    const updateResult = await Worker.updateOne(
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