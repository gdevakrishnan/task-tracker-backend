const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const { addFine, removeFine, deleteFine, getWorkerFines } = require('../controllers/fineController');
const router = express.Router();

router.route('/add-fine/:id').post(protect, addFine);
router.route('/remove-fine/:id/:fineId').post(protect, removeFine);
router.route('/delete-fine/:id/:fineId').delete(protect, deleteFine); // ADD THIS
router.route('/worker-fines/:id').get(protect, getWorkerFines);

module.exports = router;