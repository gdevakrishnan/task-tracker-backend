// backend/controllers/salaryController.js
const asyncHandler = require('express-async-handler');
const Worker = require('../models/Worker');
const Attendance = require('../models/Attendance');
const Holiday = require('../models/Holiday');
const Leave = require('../models/Leave');
const Settings = require('../models/Settings');
const { calculateWorkerProductivity } = require('../utils/productivityCalculator');

const giveBonus = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { amount, fromDate, toDate } = req.body;

    if (!amount || isNaN(amount)) {
        return res.status(400).json({ message: 'Bonus amount must be a valid number' });
    }

    // Validate date range for calculating actual earned salary
    if (!fromDate || !toDate) {
        return res.status(400).json({ message: 'Date range (fromDate and toDate) is required for bonus calculation' });
    }

    const worker = await Worker.findById(id);
    if (!worker) {
        return res.status(404).json({ message: 'Worker not found' });
    }

    // Get attendance data for the specified period
    const attendanceData = await Attendance.find({
        worker: id,
        date: {
            $gte: new Date(fromDate),
            $lte: new Date(toDate)
        }
    });

    const leaveData = await Leave.find({
        worker: id,
        status: 'Approved'
    });

    const holidays = await Holiday.find({});
    const settings = await Settings.findOne({ subdomain: worker.subdomain });
    const batches = settings ? settings.batches : [];

    // Calculate worker productivity to get actual earned salary
    const productivityReport = calculateWorkerProductivity({
        worker,
        attendanceData,
        fromDate,
        toDate,
        options: {
            batches,
            holidays,
            permissionTimeMinutes: settings ? settings.permissionTimeMinutes : 15,
            deductSalary: settings ? settings.deductSalary : true,
            intervals: settings ? settings.intervals : []
        }
    });

    // Get the worker's actual earned salary from the report
    const actualEarnedSalary = productivityReport.summary.finalSalary || 0;
    const baseSalary = worker.salary || 0;
    
    // Calculate the new bonus logic:
    // 1. Subtract base salary from bonus amount
    // 2. Instead of paying full base salary, pay what they actually earned
    // 3. Add remaining bonus to their actual earnings
    const bonusAmount = Number(amount);
    const remainingBonus = Math.max(0, bonusAmount - baseSalary);
    const finalPayout = actualEarnedSalary + remainingBonus;

    // Store bonus information
    worker.bonuses.push({
        amount: bonusAmount,
        fromDate: new Date(fromDate),
        toDate: new Date(toDate)
    });

    // Update worker's final salary with the new calculation
    worker.finalSalary = finalPayout;
    await worker.save();
    
    res.status(200).json({ 
        message: 'Bonus calculated and added successfully', 
        worker,
        calculationDetails: {
            baseSalary: baseSalary,
            bonusAmount: bonusAmount,
            actualEarnedSalary: actualEarnedSalary,
            remainingBonus: remainingBonus,
            finalPayout: finalPayout
        }
    });
});

const removeBonus = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const worker = await Worker.findById(id);
    if (!worker) {
        return res.status(404).json({ message: 'Worker not found' });
    }

    // Reset the worker's final salary to their base salary
    worker.finalSalary = worker.salary;
    
    // Remove all bonuses
    worker.bonuses = [];
    
    await worker.save();
    
    res.status(200).json({ 
        message: 'Bonus removed successfully', 
        worker
    });
});

const resetSalary = asyncHandler(async (req, res) => {
    const { subdomain } = req.body;

    if (!subdomain) {
        return res.status(400).json({ message: 'Subdomain is required' });
    }

    const workers = await Worker.find({ subdomain });

    if (workers.length === 0) {
        return res.status(404).json({ message: 'No workers found for this subdomain' });
    }

    const updatePromises = workers.map(worker => {
        worker.finalSalary = worker.salary;
        // Remove all bonuses when resetting salary
        worker.bonuses = [];
        return worker.save();
    });

    await Promise.all(updatePromises);

    res.status(200).json({ message: 'Salaries reset successfully', updatedCount: workers.length });
});

const getWorkerSalaryReport = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { fromDate, toDate } = req.query;

    if (!fromDate || !toDate) {
        return res.status(400).json({ message: 'Start and end dates are required' });
    }

    try {
        // POPULATE DEPARTMENT AND INCLUDE FINES IN THE WORKER DATA
        const worker = await Worker.findById(id).populate('department').select('+fines');

        if (!worker) {
            return res.status(404).json({ message: 'Worker not found' });
        }

        const attendanceData = await Attendance.find({
            worker: id,
            date: {
                $gte: new Date(fromDate),
                $lte: new Date(toDate)
            }
        });

        const leaveData = await Leave.find({
            worker: id,
            status: 'Approved'
        });

        const holidays = await Holiday.find({});
        const settings = await Settings.findOne({ subdomain: worker.subdomain });
        const batches = settings ? settings.batches : [];

        // FIXED THIS LINE: Pass the worker object to the calculator function
        const report = calculateWorkerProductivity({
            worker, // ADDED: Pass the worker object
            attendanceData,
            fromDate,
            toDate,
            options: {
                batches,
                holidays,
                permissionTimeMinutes: settings ? settings.permissionTimeMinutes : 15,
                deductSalary: settings ? settings.deductSalary : true,
                intervals: settings ? settings.intervals : []
            }
        });

        // Check if there are any bonuses for this period
        const bonusesForPeriod = worker.bonuses.filter(bonus => {
            return (
                (new Date(bonus.fromDate) <= new Date(toDate)) &&
                (new Date(bonus.toDate) >= new Date(fromDate))
            );
        });

        // Calculate total bonus amount for this period
        const totalBonusAmount = bonusesForPeriod.reduce((total, bonus) => total + bonus.amount, 0);
        
        // Calculate the final salary with bonus logic applied
        // This is the salary that would be paid to the worker based on your bonus calculation
        let finalSalaryWithBonus = report.summary.finalSalary; // Default to actual earned salary (after deductions)
        
        if (totalBonusAmount > 0 && bonusesForPeriod.length > 0) {
            // Get the first bonus for calculation (assuming one bonus per period)
            const bonus = bonusesForPeriod[0];
            
            // Recalculate using the same logic as giveBonus
            const baseSalary = worker.salary || 0;
            const actualEarnedSalary = report.summary.finalSalary || 0;
            const remainingBonus = Math.max(0, bonus.amount - baseSalary);
            finalSalaryWithBonus = actualEarnedSalary + remainingBonus;
        }
        
        // ADD FINE CALCULATION FOR THE REPORT PERIOD
        // Calculate total fines for the report period
        let totalFinesAmount = 0;
        if (worker.fines && Array.isArray(worker.fines)) {
            const reportStartDate = new Date(fromDate);
            const reportEndDate = new Date(toDate);
            
            totalFinesAmount = worker.fines
                .filter(fine => {
                    const fineDate = new Date(fine.date);
                    return fineDate >= reportStartDate && fineDate <= reportEndDate;
                })
                .reduce((total, fine) => total + (fine.amount || 0), 0);
        }
        
        // Calculate final salary after deducting fines
        const finalSalaryWithFines = Math.max(0, finalSalaryWithBonus - totalFinesAmount);

        res.status(200).json({
            message: 'Salary report generated successfully',
            report,
            bonuses: bonusesForPeriod,
            totalBonusAmount: totalBonusAmount,
            totalFinesAmount: totalFinesAmount, // ADD THIS
            finalSalaryWithBonus: finalSalaryWithBonus,
            finalSalaryWithFines: finalSalaryWithFines, // ADD THIS
            worker: {
                name: worker.name,
                salary: worker.salary,
                finalSalary: worker.finalSalary,
                perDaySalary: worker.perDaySalary,
                fines: worker.fines // ADD THIS
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to generate salary report' });
    }
});

module.exports = {
    giveBonus,
    removeBonus,
    resetSalary,
    getWorkerSalaryReport
};