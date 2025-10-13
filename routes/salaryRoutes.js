const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const { giveBonus, removeBonus, resetSalary, getWorkerSalaryReport } = require('../controllers/salaryController');
const router = express.Router();

router.route('/give-bonus/:id').post(protect, giveBonus);
router.route('/remove-bonus/:id').post(protect, removeBonus);
router.route('/reset-salary').post(protect, resetSalary);
router.route('/report/:id').get(protect, getWorkerSalaryReport);

module.exports = router;