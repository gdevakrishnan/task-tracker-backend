const mongoose = require('mongoose');
const dotenv = require('dotenv');
const { calculateWorkerProductivity } = require('../utils/productivityCalculator');
const Worker = require('../models/Worker');
const Attendance = require('../models/Attendance');
const Holiday = require('../models/Holiday');

dotenv.config();

const verifyTotalSalaryColumn = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('Connected to MongoDB');
    
    // Get a worker for testing
    const worker = await Worker.findOne({ rfid: 'MU6946' }); // Using the worker from the previous example
    if (!worker) {
      console.log('Worker not found');
      return;
    }
    
    console.log('Worker:', { id: worker._id, rfid: worker.rfid, name: worker.name, salary: worker.salary });
    
    // Get attendance data for a specific period
    const fromDate = '2025-09-01';
    const toDate = '2025-09-30';
    
    const attendanceData = await Attendance.find({
      worker: worker._id,
      date: {
        $gte: new Date(fromDate),
        $lte: new Date(toDate)
      }
    });
    
    console.log(`Found ${attendanceData.length} attendance records`);
    
    // Get all holidays
    const holidays = await Holiday.find({});
    console.log(`Found ${holidays.length} holidays`);
    
    // Get settings (using default values for simplicity)
    const settings = {
      batches: [{
        batchName: worker.batch || 'Full Time',
        from: '09:00',
        to: '19:00',
        lunchFrom: '12:00',
        lunchTo: '13:00'
      }]
    };
    
    // Calculate productivity
    const result = calculateWorkerProductivity({
      worker,
      attendanceData,
      fromDate,
      toDate,
      options: {
        batches: settings.batches,
        holidays,
        deductSalary: true,
        permissionTimeMinutes: 15
      }
    });
    
    console.log('\n--- Report Data ---');
    console.log('Total records in report:', result.report.length);
    
    // Show first few records with all columns
    console.log('\n--- Sample Report Entries ---');
    result.report.slice(0, 10).forEach((entry, index) => {
      console.log(`${index + 1}. Date: ${entry.date}`);
      console.log(`   Status: ${entry.status}`);
      console.log(`   In Time: ${entry.inTime}`);
      console.log(`   Out Time: ${entry.outTime}`);
      console.log(`   Delay Time: ${entry.delayTime}`);
      console.log(`   Delay Deduction: ${entry.deductionAmount}`);
      console.log(`   Total Salary: ${entry.totalSalary}`);
      console.log('');
    });
    
    // Verify that all entries have the totalSalary field
    const entriesWithTotalSalary = result.report.filter(entry => entry.totalSalary);
    console.log(`Entries with totalSalary field: ${entriesWithTotalSalary.length}/${result.report.length}`);
    
    // Check if there are any entries without totalSalary
    const entriesWithoutTotalSalary = result.report.filter(entry => !entry.totalSalary);
    if (entriesWithoutTotalSalary.length > 0) {
      console.log(`WARNING: ${entriesWithoutTotalSalary.length} entries missing totalSalary field`);
      entriesWithoutTotalSalary.slice(0, 3).forEach(entry => {
        console.log('  Missing entry:', entry);
      });
    } else {
      console.log('✓ All entries have totalSalary field');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Verification failed:', error);
    process.exit(1);
  }
};

verifyTotalSalaryColumn();