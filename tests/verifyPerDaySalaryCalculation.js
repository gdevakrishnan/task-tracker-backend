const mongoose = require('mongoose');
const dotenv = require('dotenv');
const { calculateWorkerProductivity } = require('../utils/productivityCalculator');
const Worker = require('../models/Worker');
const Attendance = require('../models/Attendance');
const Holiday = require('../models/Holiday');

dotenv.config();

const verifyPerDaySalaryCalculation = async () => {
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
    
    console.log('Worker Details:');
    console.log('- ID:', worker._id);
    console.log('- RFID:', worker.rfid);
    console.log('- Name:', worker.name);
    console.log('- Monthly Salary:', worker.salary);
    
    // Analyze the period (September 2025)
    const fromDate = '2025-09-01';
    const toDate = '2025-09-30';
    
    console.log('\nPeriod Analysis (September 2025):');
    console.log('- From Date:', fromDate);
    console.log('- To Date:', toDate);
    
    // Generate all dates in the period
    const generateDateRange = (fromDate, toDate) => {
      const dates = [];
      const currentDate = new Date(fromDate);
      const endDate = new Date(toDate);
      while (currentDate <= endDate) {
        dates.push(new Date(currentDate));
        currentDate.setDate(currentDate.getDate() + 1);
      }
      return dates;
    };
    
    const allDates = generateDateRange(fromDate, toDate);
    console.log('- Total Days in Period:', allDates.length);
    
    // Count Sundays
    const countSundaysInRange = (fromDate, toDate) => {
      const dates = generateDateRange(fromDate, toDate);
      return dates.filter(date => date.getDay() === 0).length;
    };
    
    const totalSundays = countSundaysInRange(fromDate, toDate);
    console.log('- Total Sundays:', totalSundays);
    
    // Get holidays that apply to this worker
    const holidays = await Holiday.find({});
    console.log('- Total Holidays in Database:', holidays.length);
    
    // Filter holidays that apply to this worker in the period
    const isHolidayForWorker = (date, workerId) => {
      if (!holidays || holidays.length === 0) return null;
      const dateStr = new Date(date).toISOString().split('T')[0];
      const holiday = holidays.find(h => {
        const holidayDate = new Date(h.date).toISOString().split('T')[0];
        // Check if dates match
        if (holidayDate !== dateStr) return false;
        
        // If it's a company-wide holiday (appliesTo: 'all'), it applies to all workers
        if (h.appliesTo === 'all') return true;
        
        // If it's a specific holiday, check if the worker is in the workers array
        if (h.appliesTo === 'specific' && h.workers) {
          // Handle both string IDs and object IDs
          return h.workers.some(w => {
            // Convert both values to strings for comparison
            const workerIdStr = workerId.toString ? workerId.toString() : String(workerId);
            if (typeof w === 'string') {
              return w === workerIdStr;
            } else if (w && typeof w === 'object') {
              const wIdStr = (w._id || w).toString ? (w._id || w).toString() : String(w._id || w);
              return wIdStr === workerIdStr;
            }
            return false;
          });
        }
        
        return false;
      });
      return holiday || null;
    };
    
    const workerHolidaysInPeriod = allDates.filter(date => isHolidayForWorker(date, worker._id));
    console.log('- Employee-Specific Holidays in Period:', workerHolidaysInPeriod.length);
    workerHolidaysInPeriod.forEach(holiday => {
      console.log('  *', new Date(holiday).toISOString().split('T')[0], 
                  holidays.find(h => new Date(h.date).toISOString().split('T')[0] === new Date(holiday).toISOString().split('T')[0]).holidayDesc);
    });
    
    // Calculate working days according to different methods
    console.log('\nWorking Days Calculation:');
    
    // Method 1: Total days - Sundays (your calculation)
    const workingDaysMethod1 = allDates.length - totalSundays;
    console.log('- Method 1 (Total - Sundays):', workingDaysMethod1, 'days');
    console.log('  Per-day salary (Method 1): ₹', (worker.salary / workingDaysMethod1).toFixed(2));
    
    // Method 2: Total days - Sundays - Holidays (current implementation)
    const workingDaysMethod2 = allDates.length - totalSundays - workerHolidaysInPeriod.length;
    console.log('- Method 2 (Total - Sundays - Holidays):', workingDaysMethod2, 'days');
    console.log('  Per-day salary (Method 2): ₹', (worker.salary / workingDaysMethod2).toFixed(2));
    
    // Let's check what the actual productivity calculator is doing
    console.log('\nActual Productivity Calculator Results:');
    
    const attendanceData = await Attendance.find({
      worker: worker._id,
      date: {
        $gte: new Date(fromDate),
        $lte: new Date(toDate)
      }
    });
    
    const settings = {
      batches: [{
        batchName: worker.batch || 'Full Time',
        from: '09:00',
        to: '19:00',
        lunchFrom: '12:00',
        lunchTo: '13:00'
      }]
    };
    
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
    
    console.log('- Total Days in Period:', result.summary.totalDaysInPeriod);
    console.log('- Total Sundays:', result.summary.totalSundaysInPeriod);
    console.log('- Total Holidays:', result.summary.totalHolidaysInPeriod);
    console.log('- Total Working Days:', result.summary.totalWorkingDaysInPeriod);
    console.log('- Per Day Salary:', result.summary.perDaySalary.toFixed(2));
    
    // Verify the calculation
    const expectedWorkingDays = result.summary.totalDaysInPeriod - result.summary.totalSundaysInPeriod - result.summary.totalHolidaysInPeriod;
    console.log('\nVerification:');
    console.log('- Expected Working Days:', expectedWorkingDays);
    console.log('- Actual Working Days:', result.summary.totalWorkingDaysInPeriod);
    console.log('- Match:', expectedWorkingDays === result.summary.totalWorkingDaysInPeriod);
    
    const expectedPerDaySalary = worker.salary / result.summary.totalWorkingDaysInPeriod;
    console.log('- Expected Per Day Salary:', expectedPerDaySalary.toFixed(2));
    console.log('- Actual Per Day Salary:', result.summary.perDaySalary.toFixed(2));
    console.log('- Match:', Math.abs(expectedPerDaySalary - result.summary.perDaySalary) < 0.01);
    
    process.exit(0);
  } catch (error) {
    console.error('Verification failed:', error);
    process.exit(1);
  }
};

verifyPerDaySalaryCalculation();