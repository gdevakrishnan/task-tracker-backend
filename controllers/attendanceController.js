const Attendance = require('../models/Attendance');
const Worker = require('../models/Worker');
const Department = require('../models/Department');

// @desc    Update or create attendance record for a worker
// @route   PUT /api/attendance
// @access  Private
const putAttendance = async (req, res) => {
    try {
        const { rfid, subdomain } = req.body;

        if (!subdomain || subdomain === 'main') {
            res.status(401);
            throw new Error('Company name is missing, login again');
        }

        if (!rfid || rfid === '') {
            res.status(401);
            throw new Error('RFID is required');
        }

        // login again if the worker exists in the Worker model
        const worker = await Worker.findOne({ subdomain, rfid });
        if (!worker) {
            res.status(404);
            throw new Error('Worker not found');
        }

        // Fetch the department name using the worker.department ObjectId
        const department = await Department.findById(worker.department);
        if (!department) {
            res.status(404);
            throw new Error('Department not found');
        }

        // Get the current date and time in 'Asia/Kolkata' timezone
        const indiaTimezone = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Kolkata',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });

        const currentDate = indiaTimezone.format(new Date());
        const currentTime = new Date().toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata' });

        // login again if this is the first attendance for the worker on the current date
        const allAttendances = await Attendance.find({ rfid, subdomain }).sort({ createdAt: -1 });

        let presence = true;
        if (allAttendances.length > 0) {
            const lastAttendance = allAttendances[0];
            presence = !lastAttendance.presence;
        }

        // Insert attendance record
        const newAttendance = await Attendance.create({
            name: worker.name,
            username: worker.username,
            rfid,
            subdomain,
            department: department._id,
            departmentName: department.name,
            photo: worker.photo,
            date: currentDate,
            time: currentTime,
            presence,
            worker: worker._id
        });

        res.status(201).json({
            message: presence ? 'Attendance marked as in' : 'Attendance marked as out',
            attendance: newAttendance
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc   Update or create attendance record for a worker
// @route   PUT /api/rfid-attendance
// @access  Private
const putRfidAttendance = async (req, res) => {
    try {
        const { rfid } = req.body;

        if (!rfid || rfid === '') {
            res.status(401);
            throw new Error('RFID is required');
        }

        // login again if the worker exists in the Worker model
        const worker = await Worker.findOne({ rfid });
        if (!worker) {
            res.status(404);
            throw new Error('Worker not found');
        }

        const { subdomain } = worker;

        // Fetch the department name using the worker.department ObjectId
        const department = await Department.findById(worker.department);
        if (!department) {
            res.status(404);
            throw new Error('Department not found');
        }

        // Get the current date and time in 'Asia/Kolkata' timezone
        const indiaTimezone = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Kolkata',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });

        const currentDate = indiaTimezone.format(new Date());
        const currentTime = new Date().toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata' });

        // login again if this is the first attendance for the worker on the current date
        const allAttendances = await Attendance.find({ rfid, subdomain }).sort({ createdAt: -1 });

        let presence = true;
        if (allAttendances.length > 0) {
            const lastAttendance = allAttendances[0];
            presence = !lastAttendance.presence;
        }

        // Insert attendance record
        const newAttendance = await Attendance.create({
            name: worker.name,
            username: worker.username,
            rfid,
            subdomain: subdomain,
            department: department._id,
            departmentName: department.name,
            photo: worker.photo,
            date: currentDate,
            time: currentTime,
            presence,
            worker: worker._id
        });

        res.status(201).json({
            message: presence ? 'Attendance marked as in' : 'Attendance marked as out',
            attendance: newAttendance
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Retrieve all attendance records for a specific subdomain
// @route   GET /api/attendance
// @access  Private
const getAttendance = async (req, res) => {
    try {
        const { subdomain } = req.body;

        if (!subdomain || subdomain == 'main') {
            res.status(401);
            throw new Error('Company name is missing, login again');
        }

        const attendanceData = await Attendance.find({ subdomain }).populate('worker');

        res.status(200).json({ message: 'Attendance data retrieved successfully', attendance: attendanceData });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Retrieve attendance records for a specific worker by RFID and subdomain
// @route   GET /api/attendance/worker
// @access  Public
const getWorkerAttendance = async (req, res) => {
    try {
        const { rfid, subdomain } = req.body;

        if (!subdomain || subdomain == 'main') {
            res.status(401);
            throw new Error('Company name is missing, login again');
        }

        if (!rfid || rfid == '') {
            res.status(401);
            throw new Error('RFID is required');
        }

        const workerAttendance = await Attendance.find({ rfid, subdomain });

        res.status(200).json({ message: 'Worker attendance data retrieved successfully', attendance: workerAttendance });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

module.exports = { putAttendance, putRfidAttendance, getAttendance, getWorkerAttendance };