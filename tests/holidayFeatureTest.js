const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Holiday = require('../models/Holiday');

dotenv.config();

const testHolidayFeature = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('Connected to MongoDB');
    
    // Test 1: Check existing holidays (should have default values)
    const existingHolidays = await Holiday.find({});
    console.log(`Found ${existingHolidays.length} total holidays`);
    
    if (existingHolidays.length > 0) {
      const holiday = existingHolidays[0];
      console.log('Sample holiday:', {
        _id: holiday._id,
        holidayDesc: holiday.holidayDesc,
        date: holiday.date,
        appliesTo: holiday.appliesTo,
        workers: holiday.workers,
        isPaid: holiday.isPaid
      });
      
      // Verify default values
      if (holiday.appliesTo === 'all' && Array.isArray(holiday.workers) && holiday.isPaid === true) {
        console.log('✓ Existing holidays have correct default values');
      } else {
        console.log('✗ Existing holidays do not have correct default values');
      }
    }
    
    console.log('Test completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
};

testHolidayFeature();