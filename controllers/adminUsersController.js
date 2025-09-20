const User = require('../models/User');
const AdminUser = require('../models/AdminUser');
const Chat = require('../models/Chat');
const Message = require('../models/Message');
const Friendship = require('../models/Friendship');
const UserInterest = require('../models/UserInterest');
const Report = require('../models/Report');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const sendEmail = require('../utils/sendEmail');
const logAuditEvent = require('../utils/auditLogger');
const mongoose = require('mongoose');
require('dotenv').config();
const { validationResult } = require('express-validator');

const generateUserToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, {
      expiresIn: '1h',
    });
};


// @desc    Get all users (paginated, filterable)
// @route   GET /api/admin/users
// @access  Private (Admin)
const getAllUsers = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const query = { isDeleted: false }; 
    if (req.query.showDeleted === 'true' && req.adminUser.role === 'superadmin') { 
        delete query.isDeleted;
    } else if (req.query.showDeleted === 'only' && req.adminUser.role === 'superadmin') {
        query.isDeleted = true; 
    }


    if (req.query.username) query.username = { $regex: req.query.username, $options: 'i' };
    if (req.query.email) query.email = { $regex: req.query.email, $options: 'i' };
    if (req.query.isBanned) query.isBanned = req.query.isBanned === 'true';
    if (req.query.isEmailVerified) query.isEmailVerified = req.query.isEmailVerified === 'true';
    if (req.query.isTestAccount) query.isTestAccount = req.query.isTestAccount === 'true';

    try {
        const users = await User.find(query).select('-password -emailVerificationToken -passwordResetToken').sort({ createdAt: -1 }).skip(skip).limit(limit);
        const totalUsers = await User.countDocuments(query);
        res.json({ users, currentPage: page, totalPages: Math.ceil(totalUsers / limit), totalUsers });
    } catch (error) {
        console.error('Admin Get All Users Error:', error);
        res.status(500).json({ message: 'Server Error fetching users' });
    }
};

// @desc    Get a single user by ID
// @route   GET /api/admin/users/:userId
// @access  Private (Admin)
const getUserById = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    try {
        const user = await User.findById(req.params.userId).select('-password -emailVerificationToken -passwordResetToken');
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.json(user);
    } catch (error) {
        console.error('Admin Get User By ID Error:', error);
         if (error.kind === 'ObjectId') {
            return res.status(404).json({ message: 'User not found (invalid ID format)' });
        }
        res.status(500).json({ message: 'Server Error fetching user details' });
    }
};

// @desc    Ban a user
// @route   PUT /api/admin/users/:userId/ban
// @access  Private (Admin - może wymagać roli 'admin' lub 'superadmin')
const banUser = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    const { banReason } = req.body;
    if (!banReason) {
        return res.status(400).json({ message: 'Ban reason is required.' });
    }
    try {
        const user = await User.findById(req.params.userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        if (user.isBanned) {
            return res.status(400).json({ message: 'User is already banned.' });
        }

        user.isBanned = true;
        user.banReason = banReason;
        user.bannedAt = Date.now();
        await user.save({ validateBeforeSave: false });

        const emailMessage = `
            Witaj ${user.username},\n\n
            Z przykrością informujemy, że Twoje konto w ${process.env.APP_NAME} zostało zbanowane.\n
            Powód: ${banReason}\n\n
            Jeśli uważasz, że to pomyłka, skontaktuj się z administratorem.\n\n
            ${process.env.EMAIL_FROM_NAME}
        `;
        try {
            await sendEmail({
                email: user.email,
                subject: `Twoje konto w ${process.env.APP_NAME} zostało zbanowane`,
                message: emailMessage,
            });
        } catch (emailError) {
            console.error("Failed to send ban notification email:", emailError);
            await logAuditEvent('ban_notification_email_failed', {type: 'system'}, 'error', {type: 'user', id: user._id}, {error: emailError.message, banReason});
        }


        await logAuditEvent(
            'admin_banned_user',
            { type: 'admin', id: req.adminUser._id },
            'admin_action',
            { type: 'user', id: user._id },
            { banReason, bannedUsername: user.username }, req
        );

        res.json({ message: `User ${user.username} banned successfully. Reason: ${banReason}` });
    } catch (error) {
        console.error('Admin Ban User Error:', error);
        await logAuditEvent('admin_ban_user_error', {type: 'admin', id: req.adminUser._id}, 'error', {type: 'user', id: req.params.userId}, {error: error.message}, req);
        res.status(500).json({ message: 'Server Error banning user' });
    }
};

// @desc    Unban a user
// @route   PUT /api/admin/users/:userId/unban
// @access  Private (Admin - może wymagać roli 'admin' lub 'superadmin')
const unbanUser = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    try {
        const user = await User.findById(req.params.userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        if (!user.isBanned) {
            return res.status(400).json({ message: 'User is not currently banned.' });
        }

        user.isBanned = false;
        user.banReason = null;
        user.bannedAt = null;
        await user.save({ validateBeforeSave: false });

        const emailMessage = `
            Witaj ${user.username},\n\n
            Informujemy, że Twoje konto w ${process.env.APP_NAME} zostało odbanowane.\n
            Możesz ponownie korzystać z aplikacji.\n\n
            ${process.env.EMAIL_FROM_NAME}
        `;
        try {
            await sendEmail({
                email: user.email,
                subject: `Twoje konto w ${process.env.APP_NAME} zostało odbanowane`,
                message: emailMessage,
            });
        } catch (emailError) {
            console.error("Failed to send unban notification email:", emailError);
            await logAuditEvent('unban_notification_email_failed', {type: 'system'}, 'error', {type: 'user', id: user._id}, {error: emailError.message});
        }

        await logAuditEvent(
            'admin_unbanned_user',
            { type: 'admin', id: req.adminUser._id },
            'admin_action',
            { type: 'user', id: user._id },
            { unbannedUsername: user.username }, req
        );

        res.json({ message: `User ${user.username} unbanned successfully.` });
    } catch (error) {
        console.error('Admin Unban User Error:', error);
        await logAuditEvent('admin_unban_user_error', {type: 'admin', id: req.adminUser._id}, 'error', {type: 'user', id: req.params.userId}, {error: error.message}, req);
        res.status(500).json({ message: 'Server Error unbanning user' });
    }
};

// @desc    Manually verify a user's email
// @route   PUT /api/admin/users/:userId/verify-email
// @access  Private (Admin)
const manuallyVerifyEmail = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
     try {
        const user = await User.findById(req.params.userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        if (user.isEmailVerified) {
            return res.status(400).json({ message: 'User email is already verified.' });
        }
        user.isEmailVerified = true;
        user.emailVerificationToken = undefined;
        user.emailVerificationTokenExpires = undefined;
        await user.save({ validateBeforeSave: false });
        res.json({ message: `Email for user ${user.username} verified successfully.` });
    } catch (error) {
        console.error('Admin Manual Verify Email Error:', error);
        res.status(500).json({ message: 'Server Error verifying email' });
    }
};

// @desc    Create a test user account
// @route   POST /api/admin/users/create-test
// @access  Private (Admin)
const createTestUser = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
        return res.status(400).json({ message: 'Username, email, and password are required for test user.' });
    }
    try {
        const userExists = await User.findOne({ $or: [{ email }, { username }] });
        if (userExists) {
            return res.status(400).json({ message: 'Test user with this email or username already exists.' });
        }

        const testUser = await User.create({
            username,
            email,
            password,
            isTestAccount: true,
            isEmailVerified: true, 
        });

        const userResponse = await User.findById(testUser._id).select('-password');

        res.status(201).json({ message: 'Test user created successfully', user: userResponse });
    } catch (error) {
        console.error('Admin Create Test User Error:', error);
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(val => val.message);
            return res.status(400).json({ message: messages.join(', ') });
        }
        res.status(500).json({ message: 'Server Error creating test user.' });
    }
};

// @desc    Generate a JWT for a test user (for admin to use in Postman/Swagger)
// @route   POST /api/admin/users/:userId/generate-test-token
// @access  Private (Admin)
const generateTestUserToken = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    try {
        const user = await User.findById(req.params.userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }
        if (!user.isTestAccount) {
            return res.status(400).json({ message: 'This user is not a designated test account.' });
        }

        const token = generateUserToken(user._id);
        res.json({
            message: `Generated JWT for test user ${user.username}. Use this token for API testing.`,
            userId: user._id,
            username: user.username,
            token: token,
        });
    } catch (error) {
        console.error('Admin Generate Test Token Error:', error);
        res.status(500).json({ message: 'Server Error generating test token.' });
    }
};

// @desc    Soft delete a user account
// @route   DELETE /api/admin/users/:userId
// @access  Private (Superadmin only)
const deleteUser = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    const userIdToDelete = req.params.userId;
    const performingAdminId = req.adminUser._id;

    try {
        const user = await User.findById(userIdToDelete);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        if (user.isDeleted) {
            return res.status(400).json({ message: 'User is already marked as deleted.' });
        }

        user.isDeleted = true;
        user.deletedAt = Date.now();
        await user.save({ validateBeforeSave: false });

        await logAuditEvent(
            'admin_soft_deleted_user',
            { type: 'admin', id: performingAdminId },
            'admin_action',
            { type: 'user', id: userIdToDelete },
            { deletedUsername: user.username }, req
        );

        res.json({ message: `User ${user.username} has been marked as deleted.` });

    } catch (error) {
        console.error('Admin Soft Delete User Error:', error);
        await logAuditEvent(
            'admin_soft_delete_user_error',
            { type: 'admin', id: performingAdminId },
            'error',
            { type: 'user', id: userIdToDelete },
            { error: error.message }, req
        );
        res.status(500).json({ message: 'Server Error soft deleting user' });
    }
};

// @desc    Restore a soft-deleted user account
// @route   PUT /api/admin/users/:userId/restore
// @access  Private (Superadmin only)
const restoreUser = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    const userIdToRestore = req.params.userId;
    const performingAdminId = req.adminUser._id;

    try {
        const user = await User.findById(userIdToRestore);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        if (!user.isDeleted) {
            return res.status(400).json({ message: 'User is not marked as deleted.' });
        }

        user.isDeleted = false;
        user.deletedAt = null;
        await user.save({ validateBeforeSave: false });

        await logAuditEvent(
            'admin_restored_user',
            { type: 'admin', id: performingAdminId },
            'admin_action',
            { type: 'user', id: userIdToRestore },
            { restoredUsername: user.username }, req
        );

        res.json({ message: `User ${user.username} has been restored.` });

    } catch (error) {
        console.error('Admin Restore User Error:', error);
         await logAuditEvent(
            'admin_restore_user_error',
            { type: 'admin', id: performingAdminId },
            'error',
            { type: 'user', id: userIdToRestore },
            { error: error.message }, req
        );
        res.status(500).json({ message: 'Server Error restoring user' });
    }
};

// @desc    Change a user's role
// @route   PUT /api/admin/users/:userId/role
// @access  Private (Superadmin only - zdefiniowane w trasie)
const changeUserRole = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { userId } = req.params;
    const { role } = req.body;

    const allowedRoles = User.schema.path('role').enumValues;
    if (!allowedRoles || !allowedRoles.includes(role)) {
        return res.status(400).json({ message: `Role "${role}" is not allowed or not defined in User schema. Allowed: ${allowedRoles ? allowedRoles.join(', ') : 'None'}` });
    }

    try {
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (user.isDeleted) {
            return res.status(400).json({ message: 'Cannot change role of a deleted user.' });
        }

        const oldRole = user.role;
        user.role = role;
        await user.save({ validateBeforeSave: false }); 

        await logAuditEvent(
            'admin_changed_user_role',
            { type: 'admin', id: req.adminUser._id }, 
            'admin_action',
            { type: 'user', id: userId },
            { oldRole: oldRole, newRole: role, targetUsername: user.username },
            req
        );

        const userResponse = await User.findById(userId).select('-password -emailVerificationToken -passwordResetToken');
        return res.status(200).json({ message: 'User role updated successfully', user: userResponse });

    } catch (err) {
        console.error('[adminUsersController.js] Admin Change User Role Error:', err);
        next(err);
    }
};


module.exports = {
    getAllUsers,
    getUserById,
    banUser,
    unbanUser,
    manuallyVerifyEmail,
    createTestUser,
    generateTestUserToken,
    deleteUser,
    restoreUser,
    changeUserRole
};