const Attendance = require('../models/Attendance');
const Worker = require('../models/Worker');
const Department = require('../models/Department');
const Settings = require('../models/Settings');

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

        const worker = await Worker.findOne({ subdomain, rfid });
        if (!worker) {
            res.status(404);
            throw new Error('Worker not found');
        }

        const department = await Department.findById(worker.department);
        if (!department) {
            res.status(404);
            throw new Error('Department not found');
        }

        // Get the current date and time in 'Asia/Kolkata' timezone
        const indiaTimezoneDate = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Kolkata',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
        const indiaTimezoneTime = new Intl.DateTimeFormat('en-US', {
            timeZone: 'Asia/Kolkata',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true
        });

        const currentDateFormatted = indiaTimezoneDate.format(new Date());
        const currentTimeFormatted = indiaTimezoneTime.format(new Date());

        const allAttendances = await Attendance.find({ rfid, subdomain }).sort({ date: 1, time: 1 });
        const lastAttendance = allAttendances.length > 0 ? allAttendances[allAttendances.length - 1] : null;

        let newPresence;
        // Determine the new presence state (IN or OUT)
        if (!lastAttendance) {
            // First punch for this worker, so it's an IN
            newPresence = true;
        } else {
            // Default behavior: toggle presence (IN -> OUT, OUT -> IN)
            newPresence = !lastAttendance.presence;

            // --- IMPORTANT: Logic for handling missed out-punches ---
            // If the new punch is an 'IN' and the last recorded punch was also an 'IN'
            // but on a *previous day*, it means the worker missed their 'OUT' punch yesterday.
            const lastPunchDateFormatted = lastAttendance.date;

            if (newPresence === true && lastAttendance.presence === true && lastPunchDateFormatted !== currentDateFormatted) {
                // This scenario indicates a missed OUT punch for the previous day.
                // Create an auto-generated OUT record for the missed day.

                // You might want to get this time from your Settings model (e.g., end of working day)
                // For now, using a default value, but ideally, you'd fetch it from Settings:
                // const settings = await Settings.findOne({ subdomain });
                // const defaultEndOfDayTime = settings?.batches?.[0]?.to || '19:00:00 PM'; // Example: get from first batch or default
                const defaultEndOfDayTime = '07:00:00 PM'; // Default to 7:00 PM for missed out-punch

                await Attendance.create({
                    name: worker.name,
                    username: worker.username,
                    rfid,
                    subdomain,
                    department: department._id,
                    departmentName: department.name,
                    photo: worker.photo,
                    date: lastAttendance.date, // Use the date of the missed IN punch
                    time: defaultEndOfDayTime,
                    presence: false, // This marks it as an OUT punch
                    worker: worker._id,
                    isMissedOutPunch: true // Flag this as an auto-generated / missed out punch
                });
                console.log(`Auto-generated OUT for ${worker.name} on ${lastPunchDateFormatted} due to missed punch.`);
            }
        }

        // Insert the current attendance record
        const newAttendance = await Attendance.create({
            name: worker.name,
            username: worker.username,
            rfid,
            subdomain,
            department: department._id,
            departmentName: department.name,
            photo: worker.photo,
            date: currentDateFormatted,
            time: currentTimeFormatted,
            presence: newPresence,
            worker: worker._id
        });

        res.status(201).json({
            message: newPresence ? 'Attendance marked as in' : 'Attendance marked as out',
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
        const allAttendances = await Attendance.find({ rfid, subdomain }).sort({ date: 1, time: 1 });

        let presence = true;
        if (allAttendances.length > 0) {
            const lastAttendance = allAttendances[allAttendances.length - 1];
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

        const attendanceData = await Attendance.find({ subdomain }).populate('worker').populate('department');

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

        const workerAttendance = await Attendance.find({ rfid, subdomain }).sort({ date: 1, time: 1 });

        res.status(200).json({ message: 'Worker attendance data retrieved successfully', attendance: workerAttendance });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

module.exports = { putAttendance, putRfidAttendance, getAttendance, getWorkerAttendance };