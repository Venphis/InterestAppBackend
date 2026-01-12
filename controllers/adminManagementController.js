const AdminUser = require('../models/AdminUser');
const { validationResult } = require('express-validator');
const logAuditEvent = require('../utils/auditLogger');

// Create new admin (Superadmin only)
const createAdminAccount = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { username, password, role, isActive } = req.body;

    // Validate role against enum values
    const allowedRoles = AdminUser.schema.path('role').enumValues;
    if (!allowedRoles.includes(role)) {
        return res.status(400).json({ message: `Invalid role. Allowed: ${allowedRoles.join(', ')}` });
    }

    try {
        const exists = await AdminUser.exists({ username });
        if (exists) return res.status(400).json({ message: 'Username taken' });

        const newAdmin = await AdminUser.create({
            username,
            password,
            role,
            isActive: isActive !== undefined ? isActive : true
        });

        // Fetch without password for response
        const responseData = await AdminUser.findById(newAdmin._id).select('-password');
        
        await logAuditEvent('superadmin_created_admin', { type: 'admin', id: req.adminUser._id }, 'admin_action', { type: 'admin', id: newAdmin._id }, { username, role }, req);
        
        res.status(201).json(responseData);
    } catch (error) {
        console.error('Create Admin Error:', error.message);
        next(error);
    }
};

// Get list of all admins
const getAllAdminAccounts = async (req, res, next) => {
    try {
        const admins = await AdminUser.find().select('-password').sort('username');
        res.json(admins);
    } catch (error) {
        next(error);
    }
};

// Get single admin by ID
const getAdminAccountById = async (req, res, next) => {
    try {
        const admin = await AdminUser.findById(req.params.adminId).select('-password');
        if (!admin) return res.status(404).json({ message: 'Admin not found' });
        res.json(admin);
    } catch (error) {
        next(error);
    }
};

// Update admin details (role, active status)
const updateAdminAccount = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { role, isActive } = req.body;
    const targetId = req.params.adminId;
    const actorId = req.adminUser._id.toString();

    // Prevent self-lockout
    if (targetId === actorId) {
        if (isActive === false) return res.status(400).json({ message: 'Cannot deactivate own account' });
        if (role && role !== 'superadmin') return res.status(400).json({ message: 'Cannot demote self' });
    }

    try {
        const admin = await AdminUser.findById(targetId);
        if (!admin) return res.status(404).json({ message: 'Admin not found' });

        const oldData = { role: admin.role, isActive: admin.isActive };

        // Last Superadmin protection logic
        if ((role && role !== 'superadmin' && admin.role === 'superadmin') || 
            (isActive === false && admin.role === 'superadmin')) {
            
            const activeSuperadmins = await AdminUser.countDocuments({ role: 'superadmin', isActive: true });
            
            // If this is the last active superadmin (and we are changing role OR deactivating)
            if (activeSuperadmins <= 1 && admin.isActive) {
                return res.status(400).json({ message: 'Cannot modify last active Superadmin' });
            }
        }

        if (role) admin.role = role;
        if (isActive !== undefined) admin.isActive = isActive;

        const updatedAdmin = await admin.save();
        
        await logAuditEvent('superadmin_updated_admin', { type: 'admin', id: req.adminUser._id }, 'admin_action', { type: 'admin', id: updatedAdmin._id }, { oldData, newData: { role, isActive } }, req);

        res.json(await AdminUser.findById(updatedAdmin._id).select('-password'));
    } catch (error) {
        console.error('Update Admin Error:', error.message);
        next(error);
    }
};

// Delete admin account
const deleteAdminAccount = async (req, res, next) => {
    const targetId = req.params.adminId;
    const actorId = req.adminUser._id.toString();

    if (targetId === actorId) return res.status(400).json({ message: 'Cannot delete own account' });

    try {
        const adminToDelete = await AdminUser.findById(targetId);
        if (!adminToDelete) return res.status(404).json({ message: 'Admin not found' });

        if (adminToDelete.role === 'superadmin') {
            const count = await AdminUser.countDocuments({ role: 'superadmin' });
            if (count <= 1) return res.status(400).json({ message: 'Cannot delete last Superadmin' });
        }

        await AdminUser.deleteOne({ _id: targetId });

        await logAuditEvent('superadmin_deleted_admin', { type: 'admin', id: req.adminUser._id }, 'admin_action', { type: 'admin', id: targetId }, { deletedUsername: adminToDelete.username }, req);

        res.json({ message: 'Admin account deleted' });
    } catch (error) {
        console.error('Delete Admin Error:', error.message);
        next(error);
    }
};

module.exports = {
    createAdminAccount,
    getAllAdminAccounts,
    getAdminAccountById,
    updateAdminAccount,
    deleteAdminAccount
};