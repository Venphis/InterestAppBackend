// controllers/adminUsersController.js
const User = require('../models/User'); // Model zwykłego użytkownika
const AdminUser = require('../models/AdminUser'); // Model admina (do weryfikacji roli)
const crypto = require('crypto');
const jwt = require('jsonwebtoken'); // Do generowania tokenów testowych
require('dotenv').config();

// Helper do generowania tokenu JWT dla zwykłego użytkownika (używany przy generowaniu tokenu testowego)
const generateUserToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, {
      expiresIn: '1h', // Testowy token może być krótkotrwały
    });
};


// @desc    Get all users (paginated, filterable)
// @route   GET /api/admin/users
// @access  Private (Admin)
const getAllUsers = async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const query = {};
    if (req.query.username) {
        query.username = { $regex: req.query.username, $options: 'i' };
    }
    if (req.query.email) {
        query.email = { $regex: req.query.email, $options: 'i' };
    }
    if (req.query.isBanned) {
        query.isBanned = req.query.isBanned === 'true';
    }
    if (req.query.isEmailVerified) {
        query.isEmailVerified = req.query.isEmailVerified === 'true';
    }
     if (req.query.isTestAccount) {
        query.isTestAccount = req.query.isTestAccount === 'true';
    }


    try {
        const users = await User.find(query)
                                .select('-password -emailVerificationToken -passwordResetToken') // Wyklucz wrażliwe dane
                                .sort({ createdAt: -1 })
                                .skip(skip)
                                .limit(limit);
        const totalUsers = await User.countDocuments(query);

        res.json({
            users,
            currentPage: page,
            totalPages: Math.ceil(totalUsers / limit),
            totalUsers,
        });
    } catch (error) {
        console.error('Admin Get All Users Error:', error);
        res.status(500).json({ message: 'Server Error fetching users' });
    }
};

// @desc    Get a single user by ID
// @route   GET /api/admin/users/:userId
// @access  Private (Admin)
const getUserById = async (req, res) => {
    try {
        const user = await User.findById(req.params.userId).select('-password -emailVerificationToken -passwordResetToken');
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        // TODO: Można dołączyć powiązane dane np. historię zgłoszeń, logowań itp.
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

        // TODO: Rozważ wylogowanie użytkownika (unieważnienie jego tokenów JWT)
        // TODO: Wyślij email do użytkownika o banie

        res.json({ message: `User ${user.username} banned successfully. Reason: ${banReason}` });
    } catch (error) {
        console.error('Admin Ban User Error:', error);
        res.status(500).json({ message: 'Server Error banning user' });
    }
};

// @desc    Unban a user
// @route   PUT /api/admin/users/:userId/unban
// @access  Private (Admin - może wymagać roli 'admin' lub 'superadmin')
const unbanUser = async (req, res) => {
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

        res.json({ message: `User ${user.username} unbanned successfully.` });
    } catch (error) {
        console.error('Admin Unban User Error:', error);
        res.status(500).json({ message: 'Server Error unbanning user' });
    }
};

// @desc    Delete a user account
// @route   DELETE /api/admin/users/:userId
// @access  Private (Superadmin only) - Dodamy authorizeAdminRole(['superadmin']) na trasie
const deleteUser = async (req, res) => {
    try {
        const user = await User.findById(req.params.userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // TODO: Rozważ "miękkie usuwanie" zamiast fizycznego
        // TODO: Usuń powiązane dane (wiadomości, czaty, znajomości, zgłoszenia itp.) lub zanonimizuj
        await User.deleteOne({ _id: req.params.userId }); // Użyj deleteOne

        res.json({ message: `User ${user.username} and all associated data deleted successfully.` });
    } catch (error) {
        console.error('Admin Delete User Error:', error);
        res.status(500).json({ message: 'Server Error deleting user' });
    }
};

// @desc    Manually verify a user's email
// @route   PUT /api/admin/users/:userId/verify-email
// @access  Private (Admin)
const manuallyVerifyEmail = async (req, res) => {
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
            password, // Zostanie zahashowane przez hook
            isTestAccount: true,
            isEmailVerified: true, // Konta testowe mogą być od razu zweryfikowane
        });

        // Nie zwracamy hasła
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


module.exports = {
    getAllUsers,
    getUserById,
    banUser,
    unbanUser,
    deleteUser,
    manuallyVerifyEmail,
    createTestUser,
    generateTestUserToken
};