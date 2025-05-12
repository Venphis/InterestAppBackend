// controllers/adminManagementController.js
const AdminUser = require('../models/AdminUser');
const { validationResult } = require('express-validator');

// @desc    Create a new admin user by Superadmin
// @route   POST /api/admin/management/admins
// @access  Private (Superadmin only)
const createAdminAccount = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    const { username, password, role, isActive } = req.body;

    if (!username || !password || !role) {
        return res.status(400).json({ message: 'Username, password, and role are required for new admin.' });
    }
    if (password.length < 8) {
         return res.status(400).json({ message: 'Admin password must be at least 8 characters long.' });
    }
    const allowedRoles = AdminUser.schema.path('role').enumValues;
    if (!allowedRoles.includes(role)) {
        return res.status(400).json({ message: `Invalid role. Allowed roles: ${allowedRoles.join(', ')}` });
    }

    try {
        const adminExists = await AdminUser.findOne({ username });
        if (adminExists) {
            return res.status(400).json({ message: 'Admin with this username already exists.' });
        }

        // Hasło zostanie zahashowane przez hook pre-save
        const newAdmin = await AdminUser.create({
            username,
            password,
            role,
            isActive: isActive !== undefined ? isActive : true
        });

        // Nie zwracaj hasła
        const adminResponse = await AdminUser.findById(newAdmin._id);
        res.status(201).json(adminResponse);

        await logAuditEvent(
            'superadmin_created_admin_account',
            { type: 'admin', id: req.adminUser._id }, // Performing superadmin
            'admin_action',
            { type: 'admin', id: newAdmin._id }, // Target admin
            { newAdminUsername: newAdmin.username, newAdminRole: newAdmin.role }, req
        );
        res.status(201).json(adminResponse);

    } catch (error) {
        console.error('Superadmin Create Admin Error:', error);
        if (error.name === 'ValidationError') return res.status(400).json({ message: error.message });
        res.status(500).json({ message: 'Server Error creating admin account.' });
    }
};

// @desc    Get all admin accounts
// @route   GET /api/admin/management/admins
// @access  Private (Superadmin only)
const getAllAdminAccounts = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    try {
        // Wyklucz hasło
        const admins = await AdminUser.find().select('-password').sort('username');
        res.json(admins);
    } catch (error) {
        console.error('Superadmin Get Admins Error:', error);
        res.status(500).json({ message: 'Server Error fetching admin accounts.' });
    }
};

// @desc    Get a single admin account by ID
// @route   GET /api/admin/management/admins/:adminId
// @access  Private (Superadmin only)
const getAdminAccountById = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    try {
        const admin = await AdminUser.findById(req.params.adminId).select('-password');
        if (!admin) {
            return res.status(404).json({ message: 'Admin account not found.' });
        }
        res.json(admin);
    } catch (error) {
        console.error('Superadmin Get Admin By ID Error:', error);
        if (error.kind === 'ObjectId') return res.status(404).json({ message: 'Admin account not found (invalid ID).' });
        res.status(500).json({ message: 'Server Error fetching admin account.' });
    }
};

// @desc    Update an admin account (role, isActive)
// @route   PUT /api/admin/management/admins/:adminId
// @access  Private (Superadmin only)
const updateAdminAccount = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    const { role, isActive } = req.body;
    const adminIdToUpdate = req.params.adminId;
    const performingSuperadminId = req.adminUser._id; // Z protectAdmin

    if (adminIdToUpdate === performingSuperadminId.toString() && isActive === false) {
        return res.status(400).json({ message: 'Superadmin cannot deactivate their own account.' });
    }
    if (adminIdToUpdate === performingSuperadminId.toString() && role && role !== 'superadmin') {
         return res.status(400).json({ message: 'Superadmin cannot change their own role from superadmin.' });
    }


    try {
        const admin = await AdminUser.findById(adminIdToUpdate);
        if (!admin) {
            return res.status(404).json({ message: 'Admin account not found.' });
        }

        if (role) {
            const allowedRoles = AdminUser.schema.path('role').enumValues;
            if (!allowedRoles.includes(role)) {
                return res.status(400).json({ message: `Invalid role. Allowed: ${allowedRoles.join(', ')}` });
            }
            // Zapobiegaj przypadkowemu usunięciu ostatniego superadmina przez zmianę roli
            if (admin.role === 'superadmin' && role !== 'superadmin') {
                const superadminCount = await AdminUser.countDocuments({ role: 'superadmin', isActive: true });
                if (superadminCount <= 1) {
                     return res.status(400).json({ message: 'Cannot change the role of the last active superadmin.' });
                }
            }
            admin.role = role;
        }
        if (isActive !== undefined) {
             // Zapobiegaj deaktywacji ostatniego superadmina
             if (admin.role === 'superadmin' && isActive === false) {
                 const superadminCount = await AdminUser.countDocuments({ role: 'superadmin', isActive: true });
                 if (superadminCount <= 1 && admin.isActive) { // Jeśli to jest ten ostatni aktywny
                      return res.status(400).json({ message: 'Cannot deactivate the last active superadmin.' });
                 }
             }
            admin.isActive = isActive;
        }

        const updatedAdmin = await admin.save();
        const adminResponse = await AdminUser.findById(updatedAdmin._id).select('-password');
        res.json(adminResponse);

        await logAuditEvent(
            'superadmin_updated_admin_account',
            { type: 'admin', id: req.adminUser._id },
            'admin_action',
            { type: 'admin', id: adminResponse._id },
            {
                updatedFields: req.body, // Co próbowano zmienić
                previousRole: oldRole,
                previousIsActive: oldIsActive,
                targetAdminUsername: adminResponse.username
            }, req
        );
        res.json(adminResponse);

    } catch (error) {
        console.error('Superadmin Update Admin Error:', error);
        if (error.name === 'ValidationError') return res.status(400).json({ message: error.message });
        res.status(500).json({ message: 'Server Error updating admin account.' });
    }
};

// @desc    Delete an admin account (cannot delete self, cannot delete last superadmin)
// @route   DELETE /api/admin/management/admins/:adminId
// @access  Private (Superadmin only)
const deleteAdminAccount = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    const adminIdToDelete = req.params.adminId;
    const performingSuperadminId = req.adminUser._id;

    if (adminIdToDelete === performingSuperadminId.toString()) {
        return res.status(400).json({ message: 'Superadmin cannot delete their own account.' });
    }

    try {
        const adminToDelete = await AdminUser.findById(adminIdToDelete);
        if (!adminToDelete) {
            return res.status(404).json({ message: 'Admin account to delete not found.' });
        }

        // Zapobiegaj usunięciu ostatniego superadmina
        if (adminToDelete.role === 'superadmin') {
            const superadminCount = await AdminUser.countDocuments({ role: 'superadmin' });
            if (superadminCount <= 1) {
                return res.status(400).json({ message: 'Cannot delete the last superadmin account.' });
            }
        }

        await AdminUser.deleteOne({ _id: adminIdToDelete });
        res.json({ message: `Admin account ${adminToDelete.username} deleted successfully.` });

        await logAuditEvent(
            'superadmin_deleted_admin_account',
            { type: 'admin', id: req.adminUser._id },
            'admin_action',
            { type: 'admin', id: adminIdToDelete }, // targetId jest już usunięte, ale mamy ID
            { deletedAdminUsername: adminToDelete.username }, req
        );
        res.json({ message: `Admin account ${adminToDelete.username} deleted successfully.` });

    } catch (error) {
        console.error('Superadmin Delete Admin Error:', error);
        res.status(500).json({ message: 'Server Error deleting admin account.' });
    }
};


module.exports = {
    createAdminAccount,
    getAllAdminAccounts,
    getAdminAccountById,
    updateAdminAccount,
    deleteAdminAccount
};