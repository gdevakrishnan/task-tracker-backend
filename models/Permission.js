const mongoose = require('mongoose');

const permissionSchema = mongoose.Schema({
    permissionDate: {
        type: Date,
        required: [true, 'Permission date is required']
    },
    startTime: {
        type: String,
        required: [true, 'Start time is required']
    },
    endTime: {
        type: String,
        required: [true, 'End time is required']
    },
    reason: {
        type: String,
        required: [true, 'Reason is required']
    },
    subdomain: {
        type: String,
        required: [true, 'Subdomain is required']
    },
    rfid: {
        type: String,
        required: [true, 'Employee ID is missing'],
        unique: true
    },
    worker: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Worker',
        required: [true, 'Worker is required']
    },
    status: {
        type: String,
        enum: ['in-progress', 'approved', 'declined'],
        default: 'in-progress',
        required: [true, 'Status is required']
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Permission', permissionSchema);
