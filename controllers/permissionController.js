const Permission = require('../models/Permission'); // Adjust path as needed
const mongoose = require('mongoose');

// 1. Create Permission
const createPermission = async (req, res) => {
    try {
        const {
            permissionDate,
            startTime,
            endTime,
            reason,
            subdomain,
            rfid,
            worker
        } = req.body;

        // Validate required fields
        if (!permissionDate || !startTime || !endTime || !reason || !subdomain || !rfid || !worker) {
            return res.status(400).json({
                success: false,
                message: 'All required fields must be provided'
            });
        }

        // Create new permission
        const permission = new Permission({
            permissionDate,
            startTime,
            endTime,
            reason,
            subdomain,
            rfid,
            worker,
            status: 'in-progress' // Default status
        });

        const savedPermission = await permission.save();
        
        // Populate worker details in response
        await savedPermission.populate('worker');

        res.status(201).json({
            success: true,
            message: 'Permission created successfully',
            data: savedPermission
        });

    } catch (error) {
        // Handle duplicate rfid error
        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                message: 'Permission with this Employee ID already exists'
            });
        }

        // Handle validation errors
        if (error.name === 'ValidationError') {
            const errors = Object.values(error.errors).map(err => err.message);
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: errors
            });
        }

        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};

// 2. Get All Permissions by Subdomain
const getPermissionsBySubdomain = async (req, res) => {
    try {
        const { subdomain } = req.params;

        if (!subdomain) {
            return res.status(400).json({
                success: false,
                message: 'Subdomain is required'
            });
        }

        const permissions = await Permission.find({ subdomain })
            .populate('worker')
            .sort({ createdAt: -1 }); // Sort by newest first

        res.status(200).json({
            success: true,
            message: 'Permissions retrieved successfully',
            count: permissions.length,
            data: permissions
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};

// 3. Update Permission Status
const updatePermissionStatus = async (req, res) => {
    try {
        const { permissionId } = req.params;
        const { status } = req.body;

        // Validate permission ID
        if (!mongoose.Types.ObjectId.isValid(permissionId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid permission ID'
            });
        }

        // Validate status
        const validStatuses = ['in-progress', 'approved', 'declined'];
        if (!status || !validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Valid status is required (in-progress, approved, declined)'
            });
        }

        const updatedPermission = await Permission.findByIdAndUpdate(
            permissionId,
            { status },
            { new: true, runValidators: true }
        ).populate('worker');

        if (!updatedPermission) {
            return res.status(404).json({
                success: false,
                message: 'Permission not found'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Permission status updated successfully',
            data: updatedPermission
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};

// 4. Get Permissions by Subdomain and Employee ID (RFID)
const getPermissionsBySubdomainAndEmployee = async (req, res) => {
    try {
        const { subdomain, rfid } = req.params;

        if (!subdomain || !rfid) {
            return res.status(400).json({
                success: false,
                message: 'Subdomain and Employee ID (RFID) are required'
            });
        }

        const permissions = await Permission.find({ 
            subdomain, 
            rfid 
        })
        .populate('worker')
        .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            message: 'Permissions retrieved successfully',
            count: permissions.length,
            data: permissions
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};

// 5. Get Permissions by Date Range
const getPermissionsByDateRange = async (req, res) => {
    try {
        const { subdomain, rfid } = req.params;
        const { fromDate, toDate } = req.query;

        // Validate required parameters
        if (!subdomain || !rfid) {
            return res.status(400).json({
                success: false,
                message: 'Subdomain and Employee ID (RFID) are required'
            });
        }

        if (!fromDate || !toDate) {
            return res.status(400).json({
                success: false,
                message: 'fromDate and toDate query parameters are required'
            });
        }

        // Validate and parse dates
        const startDate = new Date(fromDate);
        const endDate = new Date(toDate);

        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
            return res.status(400).json({
                success: false,
                message: 'Invalid date format. Use YYYY-MM-DD format'
            });
        }

        if (startDate > endDate) {
            return res.status(400).json({
                success: false,
                message: 'fromDate cannot be greater than toDate'
            });
        }

        // Set time to cover full days
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);

        const permissions = await Permission.find({
            subdomain,
            rfid,
            permissionDate: {
                $gte: startDate,
                $lte: endDate
            }
        })
        .populate('worker')
        .sort({ permissionDate: -1 });

        res.status(200).json({
            success: true,
            message: 'Permissions retrieved successfully',
            dateRange: {
                from: fromDate,
                to: toDate
            },
            count: permissions.length,
            data: permissions
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};

// Additional utility controller - Get single permission by ID
const getPermissionById = async (req, res) => {
    try {
        const { permissionId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(permissionId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid permission ID'
            });
        }

        const permission = await Permission.findById(permissionId).populate('worker');

        if (!permission) {
            return res.status(404).json({
                success: false,
                message: 'Permission not found'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Permission retrieved successfully',
            data: permission
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};

// Additional utility controller - Delete permission
const deletePermission = async (req, res) => {
    try {
        const { permissionId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(permissionId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid permission ID'
            });
        }

        const deletedPermission = await Permission.findByIdAndDelete(permissionId);

        if (!deletedPermission) {
            return res.status(404).json({
                success: false,
                message: 'Permission not found'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Permission deleted successfully',
            data: deletedPermission
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};

module.exports = {
    createPermission,
    getPermissionsBySubdomain,
    updatePermissionStatus,
    getPermissionsBySubdomainAndEmployee,
    getPermissionsByDateRange,
    getPermissionById,
    deletePermission
};