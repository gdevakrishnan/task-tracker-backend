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

        // Get all attendance records and sort them properly by converting time to 24-hour format for comparison
        const allAttendances = await Attendance.find({ rfid, subdomain });
        
        // Sort by date and time (proper chronological sorting)
        const sortedAttendances = allAttendances.sort((a, b) => {
            // First compare by date
            if (a.date !== b.date) {
                return a.date.localeCompare(b.date);
            }
            
            // If dates are the same, compare by time (convert to 24-hour format for proper sorting)
            const timeA = convertTo24Hour(a.time);
            const timeB = convertTo24Hour(b.time);
            return timeA.localeCompare(timeB);
        });
        
        // Determine if this should be an IN or OUT punch based on count
        // Odd count (1, 3, 5, ...) = IN punch
        // Even count (2, 4, 6, ...) = OUT punch
        const todayAttendances = sortedAttendances.filter(a => a.date === currentDateFormatted);
        const totalTodayPunches = todayAttendances.length;
        
        // For the new punch:
        // If totalTodayPunches is even (0, 2, 4, ...), this should be an IN punch (presence = true)
        // If totalTodayPunches is odd (1, 3, 5, ...), this should be an OUT punch (presence = false)
        let newPresence = (totalTodayPunches % 2 === 0);
        
        console.log(`Worker: ${worker.name}, RFID: ${rfid}`);
        console.log(`Current date: ${currentDateFormatted}, Current time: ${currentTimeFormatted}`);
        console.log(`Total attendances: ${allAttendances.length}, Today's punches: ${totalTodayPunches}`);
        console.log(`New punch will be: ${newPresence ? 'IN' : 'OUT'}`);

        // Check for missed punches from previous days
        // Get the most recent attendance from a previous day
        const previousDayAttendances = sortedAttendances.filter(a => a.date !== currentDateFormatted);
        if (previousDayAttendances.length > 0) {
            const lastPreviousAttendance = previousDayAttendances[previousDayAttendances.length - 1];
            const lastPunchDateFormatted = lastPreviousAttendance.date;
            
            // If the last punch was an IN punch and it was on a previous day, create a missed OUT punch
            if (lastPreviousAttendance.presence === true && lastPunchDateFormatted !== currentDateFormatted && !lastPreviousAttendance.isMissedOutPunch) {
                console.log("Creating missed OUT punch for previous day");
                
                // Create missed OUT punch at end of work day
                const defaultEndOfDayTime = '07:00:00 PM';
                
                await Attendance.create({
                    name: worker.name,
                    username: worker.username,
                    rfid,
                    subdomain,
                    department: department._id,
                    departmentName: department.name,
                    photo: worker.photo,
                    date: lastPreviousAttendance.date,
                    time: defaultEndOfDayTime,
                    presence: false, // OUT punch
                    worker: worker._id,
                    isMissedOutPunch: true
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

        console.log(`Created new attendance: presence=${newPresence}, date=${currentDateFormatted}, time=${currentTimeFormatted}`);

        res.status(201).json({
            message: newPresence ? 'Attendance marked as in' : 'Attendance marked as out',
            attendance: newAttendance
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// Helper function to convert 12-hour format to 24-hour format for proper sorting
function convertTo24Hour(time12h) {
    if (!time12h) return '00:00:00';
    
    const [time, modifier] = time12h.split(' ');
    if (!time || !modifier) return time12h;
    
    let [hours, minutes, seconds] = time.split(':');
    if (modifier === 'PM' && hours !== '12') {
        hours = parseInt(hours, 10) + 12;
    }
    if (modifier === 'AM' && hours === '12') {
        hours = '00';
    }
    
    return `${hours.toString().padStart(2, '0')}:${minutes}:${seconds}`;
}

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

        // Get all attendance records and sort them properly by converting time to 24-hour format for comparison
        const allAttendances = await Attendance.find({ rfid, subdomain });
        
        // Sort by date and time (proper chronological sorting)
        const sortedAttendances = allAttendances.sort((a, b) => {
            // First compare by date
            if (a.date !== b.date) {
                return a.date.localeCompare(b.date);
            }
            
            // If dates are the same, compare by time (convert to 24-hour format for proper sorting)
            const timeA = convertTo24Hour(a.time);
            const timeB = convertTo24Hour(b.time);
            return timeA.localeCompare(timeB);
        });
        
        // Determine if this should be an IN or OUT punch based on count
        // Odd count (1, 3, 5, ...) = IN punch
        // Even count (2, 4, 6, ...) = OUT punch
        const todayAttendances = sortedAttendances.filter(a => a.date === currentDateFormatted);
        const totalTodayPunches = todayAttendances.length;
        
        // For the new punch:
        // If totalTodayPunches is even (0, 2, 4, ...), this should be an IN punch (presence = true)
        // If totalTodayPunches is odd (1, 3, 5, ...), this should be an OUT punch (presence = false)
        let newPresence = (totalTodayPunches % 2 === 0);
        
        console.log(`RFID Worker: ${worker.name}, RFID: ${rfid}, Subdomain: ${subdomain}`);
        console.log(`Current date: ${currentDateFormatted}, Current time: ${currentTimeFormatted}`);
        console.log(`Total RFID attendances: ${allAttendances.length}, Today's punches: ${totalTodayPunches}`);
        console.log(`New RFID punch will be: ${newPresence ? 'IN' : 'OUT'}`);

        // Check for missed punches from previous days
        // Get the most recent attendance from a previous day
        const previousDayAttendances = sortedAttendances.filter(a => a.date !== currentDateFormatted);
        if (previousDayAttendances.length > 0) {
            const lastPreviousAttendance = previousDayAttendances[previousDayAttendances.length - 1];
            const lastPunchDateFormatted = lastPreviousAttendance.date;
            
            // If the last punch was an IN punch and it was on a previous day, create a missed OUT punch
            if (lastPreviousAttendance.presence === true && lastPunchDateFormatted !== currentDateFormatted && !lastPreviousAttendance.isMissedOutPunch) {
                console.log("Creating missed OUT punch for previous day (RFID)");
                
                // Create missed OUT punch at end of work day
                const defaultEndOfDayTime = '07:00:00 PM';
                
                await Attendance.create({
                    name: worker.name,
                    username: worker.username,
                    rfid,
                    subdomain,
                    department: department._id,
                    departmentName: department.name,
                    photo: worker.photo,
                    date: lastPreviousAttendance.date,
                    time: defaultEndOfDayTime,
                    presence: false, // OUT punch
                    worker: worker._id,
                    isMissedOutPunch: true
                });
                
                console.log(`Auto-generated OUT for ${worker.name} on ${lastPunchDateFormatted} due to missed punch (RFID).`);
            }
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
            date: currentDateFormatted,
            time: currentTimeFormatted,
            presence: newPresence,
            worker: worker._id
        });

        console.log(`Created new RFID attendance: presence=${newPresence}, date=${currentDateFormatted}, time=${currentTimeFormatted}`);

        res.status(201).json({
            message: newPresence ? 'Attendance marked as in' : 'Attendance marked as out',
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