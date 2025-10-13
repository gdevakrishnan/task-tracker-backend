const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Holiday = require('../models/Holiday');
const Worker = require('../models/Worker');
const { calculateWorkerProductivity } = require('../utils/productivityCalculator');
const Attendance = require('../models/Attendance');

dotenv.config();

const debugHolidayProcessing = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('Connected to MongoDB');
    
    // Get the worker
    const worker = await Worker.findOne({ rfid: 'MU6946' });
    if (!worker) {
      console.log('Worker not found');
      return;
    }
    
    console.log('Worker:', { id: worker._id, rfid: worker.rfid, name: worker.name });
    
    // Get attendance data for September 2025
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
    console.log(`Found ${holidays.length} holidays in total`);
    
    // Filter holidays that apply to this worker
    const workerHolidays = holidays.filter(holiday => {
      if (holiday.appliesTo === 'all') return true;
      if (holiday.appliesTo === 'specific' && holiday.workers) {
        return holiday.workers.some(w => 
          w.toString() === worker._id.toString() || 
          (typeof w === 'object' && w._id && w._id.toString() === worker._id.toString())
        );
      }
      return false;
    });
    
    console.log(`Found ${workerHolidays.length} holidays that apply to this worker:`);
    workerHolidays.forEach(holiday => {
      console.log(`- ${holiday.holidayDesc} (${new Date(holiday.date).toISOString().split('T')[0]})`);
    });
    
    // Test the productivity calculation with debug info
    const settings = {
      batches: [{
        batchName: worker.batch,
        from: '09:00',
        to: '19:00',
        lunchFrom: '12:00',
        lunchTo: '13:00'
      }],
      deductSalary: true,
      permissionTimeMinutes: 15
    };
    
    console.log('\n--- Running Productivity Calculation ---');
    const result = calculateWorkerProductivity({
      worker,
      attendanceData,
      fromDate,
      toDate,
      options: {
        batches: settings.batches,
        holidays,
        deductSalary: settings.deductSalary,
        permissionTimeMinutes: settings.permissionTimeMinutes
      }
    });
    
    console.log('\n--- Results ---');
    console.log('Total Holidays in Period (from calculation):', result.summary.totalHolidaysInPeriod);
    console.log('Total Holiday Count (from processing):', result.totalHolidayCount);
    console.log('Total Working Days:', result.summary.totalWorkingDaysInPeriod);
    console.log('Total Sundays:', result.summary.totalSundaysInPeriod);
    console.log('Total Absent Days:', result.summary.totalAbsentDays);
    
    // Check specific dates
    console.log('\n--- Checking Specific Dates ---');
    const datesToCheck = ['2025-09-05', '2025-09-18', '2025-09-19', '2025-09-20'];
    datesToCheck.forEach(dateStr => {
      const date = new Date(dateStr);
      const holiday = holidays.find(h => {
        const holidayDate = new Date(h.date).toISOString().split('T')[0];
        return holidayDate === dateStr;
      });
      
      if (holiday) {
        const appliesToWorker = holiday.appliesTo === 'all' || 
          (holiday.appliesTo === 'specific' && holiday.workers && 
           holiday.workers.some(w => 
             w.toString() === worker._id.toString() || 
             (typeof w === 'object' && w._id && w._id.toString() === worker._id.toString())
           ));
        console.log(`${dateStr}: ${holiday.holidayDesc} - Applies to worker: ${appliesToWorker}`);
      } else {
        console.log(`${dateStr}: No holiday found`);
      }
    });
    
    // Show daily breakdown for the holiday dates
    console.log('\n--- Daily Breakdown for Holiday Dates ---');
    const holidayReportEntries = result.report.filter(entry => {
      const datesToCheck = ['05 September', '18 September', '19 September', '20 September'];
      return datesToCheck.includes(entry.date);
    });
    
    holidayReportEntries.forEach(entry => {
      console.log(`${entry.date}: ${entry.status} - ${entry.delayType} - ${entry.deductionAmount}`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('Debug failed:', error);
    process.exit(1);
  }
};

debugHolidayProcessing();