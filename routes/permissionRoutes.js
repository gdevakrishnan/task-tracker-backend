const express = require('express');
const router = express.Router();

// Import permission controllers
const {
    createPermission,
    getPermissionsBySubdomain,
    updatePermissionStatus,
    getPermissionsBySubdomainAndEmployee,
    getPermissionsByDateRange,
    getPermissionById,
    deletePermission
} = require('../controllers/permissionController'); // Adjust path as needed
const { protect } = require('../middleware/authMiddleware');

// ==================== MAIN ROUTES ====================

// 1. Create a new permission
// POST /api/permissions
router.post('/', protect, createPermission);

// 2. Get all permissions by subdomain
// GET /api/permissions/subdomain/:subdomain
router.get('/:subdomain', protect, getPermissionsBySubdomain);

// 3. Update permission status
// PUT /api/permissions/:permissionId/status
router.put('/:permissionId/status', protect, updatePermissionStatus);

// 4. Get permissions by subdomain and employee ID (RFID)
// GET /api/permissions/:subdomain/:rfid
router.get('/:subdomain/:rfid', protect, getPermissionsBySubdomainAndEmployee);

// 5. Get permissions by date range for specific subdomain and employee
// GET /api/permissions/:subdomain/:rfid/range?fromDate=2024-01-01&toDate=2024-01-31
router.get('/:subdomain/:rfid/range', protect, getPermissionsByDateRange);

// ==================== ADDITIONAL UTILITY ROUTES ====================

// Get single permission by ID
// GET /api/permissions/id/:permissionId
router.get('/id/:permissionId', protect, getPermissionById);

// Delete permission by ID
// DELETE /api/permissions/:permissionId
router.delete('/:permissionId', protect, deletePermission);

// ==================== ALTERNATIVE ROUTE STRUCTURE ====================
// If you prefer a more RESTful structure, you can use these instead:

/*
// Alternative RESTful routes (uncomment to use):

// GET /api/permissions - Get all permissions (you might want to add pagination)
router.get('/', getAllPermissions);

// GET /api/permissions/:id - Get permission by ID
router.get('/:id', getPermissionById);

// POST /api/permissions - Create permission
router.post('/', createPermission);

// PUT /api/permissions/:id - Update entire permission
router.put('/:id', updatePermission);

// PATCH /api/permissions/:id/status - Update permission status
router.patch('/:id/status', updatePermissionStatus);

// DELETE /api/permissions/:id - Delete permission
router.delete('/:id', deletePermission);

// GET /api/permissions/subdomain/:subdomain - Get by subdomain
router.get('/subdomain/:subdomain', getPermissionsBySubdomain);

// GET /api/permissions/employee/:subdomain/:rfid - Get by subdomain and employee
router.get('/employee/:subdomain/:rfid', getPermissionsBySubdomainAndEmployee);

// GET /api/permissions/daterange/:subdomain/:rfid - Get by date range
router.get('/daterange/:subdomain/:rfid', getPermissionsByDateRange);
*/

module.exports = router;