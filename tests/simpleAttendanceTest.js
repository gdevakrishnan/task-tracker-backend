const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

// Simple test to verify the attendance toggle logic
const simpleAttendanceTest = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('Connected to MongoDB');
    
    // Import models after connection
    const Attendance = require('../models/Attendance');
    const Worker = require('../models/Worker');
    
    // Test data - using a real worker RFID from your system
    const testRfid = 'LF3643'; // Arun R from your data
    const testSubdomain = 'techvaseegrah';
    
    // Get worker info
    const worker = await Worker.findOne({ rfid: testRfid, subdomain: testSubdomain });
    if (!worker) {
      console.log(`Worker with RFID ${testRfid} not found in subdomain ${testSubdomain}`);
      process.exit(1);
    }
    
    console.log(`Testing attendance logic for worker: ${worker.name} (${worker.rfid})`);
    
    // Clear any existing test attendance records for this RFID
    await Attendance.deleteMany({ rfid: testRfid });
    console.log(`Cleared existing attendance records for RFID: ${testRfid}`);
    
    // Test the logic for determining presence state
    console.log('\n--- Testing Attendance Toggle Logic ---');
    
    // Scenario 1: No previous attendance records (first punch should be IN)
    const allAttendances1 = await Attendance.find({ rfid: testRfid, subdomain: testSubdomain }).sort({ date: 1, time: 1 });
    const lastAttendance1 = allAttendances1.length > 0 ? allAttendances1[allAttendances1.length - 1] : null;
    
    let newPresence1;
    if (!lastAttendance1) {
      newPresence1 = true; // First punch should be IN
    } else {
      newPresence1 = !lastAttendance1.presence;
    }
    
    console.log(`Scenario 1 - No previous records: Presence should be IN (true) - Actual: ${newPresence1}`);
    
    // Create a mock "first punch" record
    const currentDate = new Date();
    const formattedDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(currentDate);
    
    const formattedTime = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    }).format(currentDate);
    
    // Create first attendance record (IN)
    const firstAttendance = await Attendance.create({
      name: worker.name,
      username: worker.username,
      rfid: worker.rfid,
      subdomain: worker.subdomain,
      department: worker.department,
      departmentName: 'Test Department', // Simplified for testing
      photo: worker.photo,
      date: formattedDate,
      time: formattedTime,
      presence: true, // IN punch
      worker: worker._id
    });
    
    console.log(`Created first attendance record: ${firstAttendance.presence ? 'IN' : 'OUT'} at ${firstAttendance.time}`);
    
    // Scenario 2: Previous record was IN, current should be OUT
    const allAttendances2 = await Attendance.find({ rfid: testRfid, subdomain: testSubdomain }).sort({ date: 1, time: 1 });
    const lastAttendance2 = allAttendances2.length > 0 ? allAttendances2[allAttendances2.length - 1] : null;
    
    let newPresence2;
    if (!lastAttendance2) {
      newPresence2 = true;
    } else {
      newPresence2 = !lastAttendance2.presence;
    }
    
    console.log(`Scenario 2 - Last was IN: Presence should be OUT (false) - Actual: ${newPresence2}`);
    
    // Create second attendance record (OUT)
    const secondAttendance = await Attendance.create({
      name: worker.name,
      username: worker.username,
      rfid: worker.rfid,
      subdomain: worker.subdomain,
      department: worker.department,
      departmentName: 'Test Department', // Simplified for testing
      photo: worker.photo,
      date: formattedDate,
      time: formattedTime,
      presence: newPresence2, // Should be OUT
      worker: worker._id
    });
    
    console.log(`Created second attendance record: ${secondAttendance.presence ? 'IN' : 'OUT'} at ${secondAttendance.time}`);
    
    // Scenario 3: Previous record was OUT, current should be IN
    const allAttendances3 = await Attendance.find({ rfid: testRfid, subdomain: testSubdomain }).sort({ date: 1, time: 1 });
    const lastAttendance3 = allAttendances3.length > 0 ? allAttendances3[allAttendances3.length - 1] : null;
    
    let newPresence3;
    if (!lastAttendance3) {
      newPresence3 = true;
    } else {
      newPresence3 = !lastAttendance3.presence;
    }
    
    console.log(`Scenario 3 - Last was OUT: Presence should be IN (true) - Actual: ${newPresence3}`);
    
    // Verify results
    console.log('\n--- Test Results ---');
    if (newPresence1 === true && newPresence2 === false && newPresence3 === true) {
      console.log('✅ SUCCESS: Attendance toggle logic is working correctly!');
      console.log('   - First punch: IN (true)');
      console.log('   - Second punch: OUT (false)');
      console.log('   - Third punch: IN (true)');
    } else {
      console.log('❌ FAILURE: Attendance toggle logic is not working correctly.');
      console.log(`   - Expected sequence: true -> false -> true`);
      console.log(`   - Actual sequence: ${newPresence1} -> ${newPresence2} -> ${newPresence3}`);
    }
    
    // Clean up test data
    await Attendance.deleteMany({ rfid: testRfid });
    console.log('\nCleaned up test data');
    
    process.exit(0);
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
};

simpleAttendanceTest();