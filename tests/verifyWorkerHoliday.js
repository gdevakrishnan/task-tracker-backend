const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Holiday = require('../models/Holiday');
const Worker = require('../models/Worker');

dotenv.config();

const verifyWorkerHoliday = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('Connected to MongoDB');
    
    // Replace with the actual worker ID from the report
    const workerId = 'MU6946'; // This might be the RFID, let's search by that
    
    // Find worker by RFID
    const worker = await Worker.findOne({ rfid: workerId });
    if (!worker) {
      console.log(`Worker with RFID ${workerId} not found`);
      // Try to find workers with similar RFID
      const workers = await Worker.find({ rfid: { $regex: workerId, $options: 'i' } });
      console.log('Similar workers found:', workers.map(w => ({ id: w._id, rfid: w.rfid, name: w.name })));
      return;
    }
    
    console.log('Worker found:', { id: worker._id, rfid: worker.rfid, name: worker.name });
    
    // Find holidays that apply to this worker
    const holidays = await Holiday.find({
      $or: [
        { appliesTo: 'all' },
        { workers: worker._id }
      ]
    }).populate('workers', 'name rfid');
    
    console.log(`Found ${holidays.length} holidays that apply to this worker:`);
    holidays.forEach(holiday => {
      console.log(`- ${holiday.holidayDesc} (${holiday.date.toISOString().split('T')[0]})`);
      console.log(`  Applies to: ${holiday.appliesTo}`);
      if (holiday.workers && holiday.workers.length > 0) {
        console.log(`  Workers: ${holiday.workers.map(w => `${w.name} (${w.rfid})`).join(', ')}`);
      }
    });
    
    // Check specific dates mentioned
    const datesToCheck = ['2025-09-05', '2025-09-18', '2025-09-19', '2025-09-20'];
    for (const dateStr of datesToCheck) {
      const date = new Date(dateStr);
      const holiday = await Holiday.findOne({
        date: date,
        $or: [
          { appliesTo: 'all' },
          { workers: worker._id }
        ]
      });
      
      if (holiday) {
        console.log(`✓ ${dateStr} is a holiday: ${holiday.holidayDesc}`);
        console.log(`  Applies to: ${holiday.appliesTo}`);
        if (holiday.appliesTo === 'specific') {
          const workerInHoliday = holiday.workers.some(w => 
            w.toString() === worker._id.toString() || 
            (typeof w === 'object' && w._id && w._id.toString() === worker._id.toString())
          );
          console.log(`  Worker is in holiday list: ${workerInHoliday}`);
        }
      } else {
        console.log(`✗ ${dateStr} is NOT a holiday for this worker`);
      }
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Verification failed:', error);
    process.exit(1);
  }
};

verifyWorkerHoliday();