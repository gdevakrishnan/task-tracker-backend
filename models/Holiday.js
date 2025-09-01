const mongoose = require('mongoose');

const holidaySchema = mongoose.Schema({
  subdomain: {
    type: String,
    required: [true, 'Company name is missing']
  },
  holidayDesc: {
    type: String,
    required: [true, 'Please add a holiday description'],
  },
  date: {
    type: Date,
    required: [true, 'Please add start date']
  },
  reason: {
    type: String,
    required: [true, 'Please add a reason']
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Holdiay', holidaySchema);