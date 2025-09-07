// backend/routes/settingsRoutes.js
const express = require('express');
const router = express.Router();
const { 
  getSettings,
  updateMealSettings,
  updateSettings
} = require('../controllers/foodRequestController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

// Admin routes
router.put('/:subdomain/:mealType', protect, adminOnly, updateMealSettings);
router.put('/:subdomain', protect, adminOnly, updateSettings);
router.get('/:subdomain', protect, getSettings);

module.exports = router;