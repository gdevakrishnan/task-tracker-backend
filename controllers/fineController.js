// backend/controllers/fineController.js
const asyncHandler = require('express-async-handler');
const Worker = require('../models/Worker');

// Add a fine to a worker
const addFine = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { amount, date, reason } = req.body;

    if (!amount || isNaN(amount) || amount <= 0) {
        return res.status(400).json({ message: 'Fine amount must be a valid positive number' });
    }

    if (!date) {
        return res.status(400).json({ message: 'Date is required' });
    }

    if (!reason || reason.trim().length === 0) {
        return res.status(400).json({ message: 'Reason is required' });
    }

    const worker = await Worker.findById(id);
    if (!worker) {
        return res.status(404).json({ message: 'Worker not found' });
    }

    // Add the fine to the worker's fines array
    worker.fines.push({
        amount: Number(amount),
        date: new Date(date),
        reason: reason.trim()
    });

    // Update the worker's final salary by deducting the fine amount
    // If finalSalary is not set, use the base salary
    const currentSalary = worker.finalSalary !== undefined ? worker.finalSalary : worker.salary || 0;
    worker.finalSalary = Math.max(0, currentSalary - Number(amount));

    await worker.save();

    res.status(200).json({ 
        message: 'Fine added successfully', 
        worker
    });
});

// Remove a fine from a worker
const removeFine = asyncHandler(async (req, res) => {
    const { id, fineId } = req.params;

    const worker = await Worker.findById(id);
    if (!worker) {
        return res.status(404).json({ message: 'Worker not found' });
    }

    // Find the fine to remove
    const fineIndex = worker.fines.findIndex(fine => fine._id.toString() === fineId);
    if (fineIndex === -1) {
        return res.status(404).json({ message: 'Fine not found' });
    }

    // Get the fine amount to add back to the salary
    const fineAmount = worker.fines[fineIndex].amount;

    // Remove the fine from the array
    worker.fines.splice(fineIndex, 1);

    // Update the worker's final salary by adding back the fine amount
    // If finalSalary is not set, use the base salary
    const currentSalary = worker.finalSalary !== undefined ? worker.finalSalary : worker.salary || 0;
    worker.finalSalary = currentSalary + fineAmount;

    await worker.save();

    res.status(200).json({ 
        message: 'Fine removed successfully', 
        worker
    });
});

// DELETE A FINE FROM A WORKER
const deleteFine = asyncHandler(async (req, res) => {
    const { id, fineId } = req.params;

    const worker = await Worker.findById(id);
    if (!worker) {
        return res.status(404).json({ message: 'Worker not found' });
    }

    // Find the fine to delete
    const fineIndex = worker.fines.findIndex(fine => fine._id.toString() === fineId);
    if (fineIndex === -1) {
        return res.status(404).json({ message: 'Fine not found' });
    }

    // Get the fine amount to add back to the salary
    const fineAmount = worker.fines[fineIndex].amount;

    // Remove the fine from the array
    worker.fines.splice(fineIndex, 1);

    // Update the worker's final salary by adding back the fine amount
    // If finalSalary is not set, use the base salary
    const currentSalary = worker.finalSalary !== undefined ? worker.finalSalary : worker.salary || 0;
    worker.finalSalary = currentSalary + fineAmount;

    await worker.save();

    res.status(200).json({ 
        message: 'Fine deleted successfully', 
        worker
    });
});

// Get all fines for a worker
const getWorkerFines = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const worker = await Worker.findById(id).select('fines');
    if (!worker) {
        return res.status(404).json({ message: 'Worker not found' });
    }

    res.status(200).json({ 
        message: 'Fines retrieved successfully', 
        fines: worker.fines
    });
});

module.exports = {
    addFine,
    removeFine,
    deleteFine, // ADD THIS
    getWorkerFines
};