const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Holiday = require('../models/Holiday');

dotenv.config();

const debugIsHolidayForWorker = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('Connected to MongoDB');
    
    // Get all holidays
    const holidays = await Holiday.find({});
    console.log(`Found ${holidays.length} holidays in total`);
    
    // Simulate the isHolidayForWorker function logic
    const workerId = '681997976defa8ff2ec4d853'; // ObjectId of the worker
    
    // Test specific dates
    const datesToCheck = ['2025-09-05', '2025-09-18', '2025-09-19', '2025-09-20'];
    
    datesToCheck.forEach(dateStr => {
      console.log(`\n--- Checking ${dateStr} ---`);
      const date = new Date(dateStr);
      const dateStrFormatted = date.toISOString().split('T')[0];
      console.log(`Checking date: ${dateStrFormatted}`);
      
      const holiday = holidays.find(h => {
        const holidayDate = new Date(h.date).toISOString().split('T')[0];
        console.log(`  Comparing with holiday date: ${holidayDate} (${h.holidayDesc})`);
        
        // Check if dates match
        if (holidayDate !== dateStrFormatted) {
          console.log(`    Dates don't match: ${holidayDate} !== ${dateStrFormatted}`);
          return false;
        }
        
        console.log(`    Dates match!`);
        
        // If it's a company-wide holiday (appliesTo: 'all'), it applies to all workers
        if (h.appliesTo === 'all') {
          console.log(`    Company-wide holiday, applies to all workers`);
          return true;
        }
        
        // If it's a specific holiday, check if the worker is in the workers array
        if (h.appliesTo === 'specific' && h.workers) {
          console.log(`    Specific holiday, checking workers list:`);
          console.log(`    Worker ID to find: ${workerId}`);
          console.log(`    Holiday workers:`, h.workers.map(w => typeof w === 'object' ? w._id || w : w));
          
          // Handle both string IDs and object IDs
          const workerFound = h.workers.some(w => {
            const workerIdStr = typeof w === 'object' ? (w._id || w).toString() : w.toString();
            const match = workerIdStr === workerId;
            console.log(`      Comparing ${workerIdStr} === ${workerId} = ${match}`);
            return match;
          });
          
          console.log(`    Worker found in holiday list: ${workerFound}`);
          return workerFound;
        }
        
        console.log(`    No match conditions met`);
        return false;
      });
      
      if (holiday) {
        console.log(`✓ ${dateStr} IS a holiday for this worker: ${holiday.holidayDesc}`);
      } else {
        console.log(`✗ ${dateStr} is NOT a holiday for this worker`);
      }
    });
    
    process.exit(0);
  } catch (error) {
    console.error('Debug failed:', error);
    process.exit(1);
  }
};

debugIsHolidayForWorker();