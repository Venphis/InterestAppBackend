const User = require('../models/User');
const UserInterest = require('../models/UserInterest');
const jwt = require('jsonwebtoken');
const sendEmail = require('../utils/sendEmail');
const logAuditEvent = require('../utils/auditLogger');
const { validationResult } = require('express-validator');
require('dotenv').config();

// Helper: Generates temporary JWT for user simulation
const generateUserToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '1h' });
};

// Retrieve paginated list of users with filtering
const getAllUsers = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const query = { isDeleted: false };
    
    // Superadmin override for viewing deleted users
    if (req.adminUser.role === 'superadmin') {
        if (req.query.showDeleted === 'true') delete query.isDeleted;
        if (req.query.showDeleted === 'only') query.isDeleted = true;
    }

    if (req.query.username) query.username = { $regex: req.query.username, $options: 'i' };
    if (req.query.email) query.email = { $regex: req.query.email, $options: 'i' };
    if (req.query.isBanned) query.isBanned = req.query.isBanned === 'true';
    if (req.query.isEmailVerified) query.isEmailVerified = req.query.isEmailVerified === 'true';
    if (req.query.isTestAccount) query.isTestAccount = req.query.isTestAccount === 'true';

    try {
        const [users, totalUsers] = await Promise.all([
            User.find(query).select('-password -emailVerificationToken -passwordResetToken').sort({ createdAt: -1 }).skip(skip).limit(limit),
            User.countDocuments(query)
        ]);

        res.json({ users, currentPage: page, totalPages: Math.ceil(totalUsers / limit), totalUsers });
    } catch (error) {
        console.error('Get Users Error:', error.message);
        next(error);
    }
};

const getUserById = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
        const user = await User.findById(req.params.userId).select('-password -emailVerificationToken -passwordResetToken');
        if (!user) return res.status(404).json({ message: 'User not found' });
        res.json(user);
    } catch (error) {
        next(error);
    }
};

const banUser = async (req, res, next) => {
    const { banReason } = req.body;
    if (!banReason) return res.status(400).json({ message: 'Ban reason required' });

    try {
        const user = await User.findById(req.params.userId);
        if (!user) return res.status(404).json({ message: 'User not found' });
        if (user.isBanned) return res.status(400).json({ message: 'User already banned' });

        user.isBanned = true;
        user.banReason = banReason;
        user.bannedAt = Date.now();
        await user.save({ validateBeforeSave: false });

        // Notify user via email
        try {
            await sendEmail({
                email: user.email,
                subject: `Account Banned - ${process.env.APP_NAME}`,
                message: `Your account has been banned.\nReason: ${banReason}`
            });
        } catch (emailError) {
            console.error("Ban email failed:", emailError.message);
        }

        await logAuditEvent('admin_banned_user', { type: 'admin', id: req.adminUser._id }, 'admin_action', { type: 'user', id: user._id }, { banReason }, req);
        res.json({ message: `User banned: ${banReason}` });
    } catch (error) {
        console.error('Ban User Error:', error.message);
        next(error);
    }
};

const unbanUser = async (req, res, next) => {
    try {
        const user = await User.findById(req.params.userId);
        if (!user) return res.status(404).json({ message: 'User not found' });
        if (!user.isBanned) return res.status(400).json({ message: 'User is not banned' });

        user.isBanned = false;
        user.banReason = null;
        user.bannedAt = null;
        await user.save({ validateBeforeSave: false });

        try {
            await sendEmail({
                email: user.email,
                subject: `Account Unbanned - ${process.env.APP_NAME}`,
                message: `Your account has been reactivated.`
            });
        } catch (emailError) {
            console.error("Unban email failed:", emailError.message);
        }

        await logAuditEvent('admin_unbanned_user', { type: 'admin', id: req.adminUser._id }, 'admin_action', { type: 'user', id: user._id }, {}, req);
        res.json({ message: 'User unbanned' });
    } catch (error) {
        next(error);
    }
};

const manuallyVerifyEmail = async (req, res, next) => {
    try {
        const user = await User.findById(req.params.userId);
        if (!user) return res.status(404).json({ message: 'User not found' });
        if (user.isEmailVerified) return res.status(400).json({ message: 'Already verified' });

        user.isEmailVerified = true;
        user.emailVerificationToken = undefined;
        user.emailVerificationTokenExpires = undefined;
        await user.save({ validateBeforeSave: false });

        res.json({ message: 'Email verified manually' });
    } catch (error) {
        next(error);
    }
};

const createTestUser = async (req, res, next) => {
    const { username, email, password } = req.body;
    if (!username || !email || !password) return res.status(400).json({ message: 'Missing fields' });

    try {
        const exists = await User.exists({ $or: [{ email }, { username }] });
        if (exists) return res.status(400).json({ message: 'User already exists' });

        const testUser = await User.create({
            username,
            email,
            password,
            isTestAccount: true,
            isEmailVerified: true, 
        });

        res.status(201).json({ message: 'Test user created', user: await User.findById(testUser._id).select('-password') });
    } catch (error) {
        next(error);
    }
};

const generateTestUserToken = async (req, res, next) => {
    try {
        const user = await User.findById(req.params.userId);
        if (!user) return res.status(404).json({ message: 'User not found' });
        if (!user.isTestAccount) return res.status(400).json({ message: 'Not a test account' });

        const token = generateUserToken(user._id);
        res.json({
            message: 'Token generated',
            userId: user._id,
            token
        });
    } catch (error) {
        next(error);
    }
};

const deleteUser = async (req, res, next) => {
    try {
        const user = await User.findById(req.params.userId);
        if (!user) return res.status(404).json({ message: 'User not found' });
        if (user.isDeleted) return res.status(400).json({ message: 'Already deleted' });

        user.isDeleted = true;
        user.deletedAt = Date.now();
        await user.save({ validateBeforeSave: false });

        await logAuditEvent('admin_soft_deleted_user', { type: 'admin', id: req.adminUser._id }, 'admin_action', { type: 'user', id: user._id }, {}, req);
        res.json({ message: 'User soft deleted' });
    } catch (error) {
        next(error);
    }
};

const restoreUser = async (req, res, next) => {
    try {
        const user = await User.findById(req.params.userId);
        if (!user) return res.status(404).json({ message: 'User not found' });
        if (!user.isDeleted) return res.status(400).json({ message: 'User is active' });

        user.isDeleted = false;
        user.deletedAt = null;
        await user.save({ validateBeforeSave: false });

        await logAuditEvent('admin_restored_user', { type: 'admin', id: req.adminUser._id }, 'admin_action', { type: 'user', id: user._id }, {}, req);
        res.json({ message: 'User restored' });
    } catch (error) {
        next(error);
    }
};

const changeUserRole = async (req, res, next) => {
    const { role } = req.body;
    const allowedRoles = User.schema.path('role').enumValues;
    
    if (!allowedRoles.includes(role)) {
        return res.status(400).json({ message: `Invalid role. Allowed: ${allowedRoles.join(', ')}` });
    }

    try {
        const user = await User.findById(req.params.userId);
        if (!user) return res.status(404).json({ message: 'User not found' });
        if (user.isDeleted) return res.status(400).json({ message: 'User is deleted' });

        const oldRole = user.role;
        user.role = role;
        await user.save({ validateBeforeSave: false });

        await logAuditEvent('admin_changed_user_role', { type: 'admin', id: req.adminUser._id }, 'admin_action', { type: 'user', id: user._id }, { oldRole, newRole: role }, req);
        res.json({ message: 'Role updated', user: await User.findById(user._id).select('-password') });
    } catch (error) {
        next(error);
    }
};

const getUserInterestsAdmin = async (req, res, next) => {
    try {
        const user = await User.findById(req.params.userId);
        if (!user) return res.status(404).json({ message: 'User not found' });

        const userInterests = await UserInterest.find({ userId: req.params.userId })
            .populate({
                path: 'interestId',
                select: 'name description category isArchived',
                populate: { path: 'category', select: 'name description' }
            });

        const formattedInterests = userInterests.map(ui => ({
            userInterestId: ui._id,
            interestId: ui.interestId?._id,
            name: ui.interestId?.name || 'Deleted Interest',
            category: ui.interestId?.category,
            description: ui.interestId?.description,
            customDescription: ui.customDescription,
            isArchived: ui.interestId?.isArchived,
            createdAt: ui.createdAt
        }));

        res.json(formattedInterests);
    } catch (error) {
        next(error);
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
    changeUserRole,
    getUserInterestsAdmin
};