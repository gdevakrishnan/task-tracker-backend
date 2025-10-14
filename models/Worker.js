const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const workerSchema = mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please add a name']
  },
  username: {
    type: String,
    required: [true, 'Please add a username'],
    unique: true
  },
  rfid: {
    type: String,
    required: [true, 'RFID is missing'],
    unique: true
  },
  subdomain: {
    type: String,
    required: [true, 'Company name is missing'],
  },
  password: {
    type: String,
    required: [true, 'Please add a password']
  },
    batch: { // ADD THIS
    type: String
  },
  department: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department',
    required: [true, 'Please select a department']
  },
  photo: {
    type: String,
    default: ''
  },
  totalPoints: {
    type: Number,
    default: 0
  },
  topicPoints: {
    type: Object,
    default: {}
  },
  lastSubmission: {
    type: Object,
    default: {}
  },
  salary: {
    type: Number,
    default: 0
  },
  finalSalary: {
    type: Number,
    default: 0
  },
  perDaySalary: {
    type: Number,
    default: 0
  },
  bonuses: {
    type: [{
      amount: Number,
      fromDate: Date,
      toDate: Date,
      createdAt: {
        type: Date,
        default: Date.now
      }
    }],
    default: []
  },
  fines: {
    type: [{
      amount: Number,
      date: Date,
      reason: String,
      createdAt: {
        type: Date,
        default: Date.now
      }
    }],
    default: []
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Worker', workerSchema);