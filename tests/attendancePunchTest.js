const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Attendance = require('../models/Attendance');
const Worker = require('../models/Worker');

dotenv.config();

// Test data - using a real worker RFID from your system
const testRfid = 'LF3643'; // Arun R from your data
const testSubdomain = 'techvaseegrah';

const attendancePunchTest = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('Connected to MongoDB');
    
    // Clear any existing test attendance records for this RFID
    await Attendance.deleteMany({ rfid: testRfid });
    console.log(`Cleared existing attendance records for RFID: ${testRfid}`);
    
    // Get worker info
    const worker = await Worker.findOne({ rfid: testRfid, subdomain: testSubdomain });
    if (!worker) {
      console.log(`Worker with RFID ${testRfid} not found in subdomain ${testSubdomain}`);
      process.exit(1);
    }
    
    console.log(`Testing attendance for worker: ${worker.name} (${worker.rfid})`);
    
    // Simulate first punch (should be IN)
    const firstPunchDate = new Date();
    firstPunchDate.setHours(9, 15, 0); // 9:15 AM
    
    const formattedDate1 = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(firstPunchDate);
    
    const formattedTime1 = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    }).format(firstPunchDate);
    
    const firstAttendance = await Attendance.create({
      name: worker.name,
      username: worker.username,
      rfid: worker.rfid,
      subdomain: worker.subdomain,
      department: worker.department._id || worker.department,
      departmentName: worker.department.name || worker.departmentName,
      photo: worker.photo,
      date: formattedDate1,
      time: formattedTime1,
      presence: true, // First punch should be IN
      worker: worker._id
    });
    
    console.log(`First punch created: ${firstAttendance.presence ? 'IN' : 'OUT'} at ${firstAttendance.time}`);
    
    // Simulate second punch (should be OUT)
    const secondPunchDate = new Date();
    secondPunchDate.setHours(10, 12, 0); // 10:12 AM
    
    const formattedDate2 = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(secondPunchDate);
    
    const formattedTime2 = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    }).format(secondPunchDate);
    
    // Get all attendance records to simulate the controller logic
    const allAttendances = await Attendance.find({ rfid: worker.rfid, subdomain: worker.subdomain }).sort({ date: 1, time: 1 });
    const lastAttendance = allAttendances.length > 0 ? allAttendances[allAttendances.length - 1] : null;
    
    let presence = true;
    if (lastAttendance) {
      presence = !lastAttendance.presence;
    }
    
    const secondAttendance = await Attendance.create({
      name: worker.name,
      username: worker.username,
      rfid: worker.rfid,
      subdomain: worker.subdomain,
      department: worker.department._id || worker.department,
      departmentName: worker.department.name || worker.departmentName,
      photo: worker.photo,
      date: formattedDate2,
      time: formattedTime2,
      presence: presence, // Should be OUT (false) since last was IN (true)
      worker: worker._id
    });
    
    console.log(`Second punch created: ${secondAttendance.presence ? 'IN' : 'OUT'} at ${secondAttendance.time}`);
    
    // Verify the results
    if (firstAttendance.presence === true && secondAttendance.presence === false) {
      console.log('✅ SUCCESS: Attendance punching is working correctly!');
      console.log('   First punch was IN, second punch was OUT as expected.');
    } else {
      console.log('❌ FAILURE: Attendance punching is not working correctly.');
      console.log(`   Expected: First IN (true), Second OUT (false)`);
      console.log(`   Actual: First ${firstAttendance.presence ? 'IN' : 'OUT'}, Second ${secondAttendance.presence ? 'IN' : 'OUT'}`);
    }
    
    // Clean up test data
    await Attendance.deleteMany({ rfid: testRfid });
    console.log('Cleaned up test data');
    
    process.exit(0);
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
};

attendancePunchTest();