const User = require('../models/User');
const UserInterest = require('../models/UserInterest');
const Interest = require('../models/Interest');
const fs = require('fs');
const path = require('path');
const { validationResult } = require('express-validator');
const mongoose = require('mongoose');

// Retrieve detailed profile for authenticated user
const getUserProfile = async (req, res, next) => {
    try {
        const userInterests = await UserInterest.find({ userId: req.user._id })
            .populate('interestId', 'name category');

        res.json({
            ...req.user.toObject(),
            interests: userInterests.map(ui => ({
                userInterestId: ui._id,
                interest: ui.interestId,
                customDescription: ui.customDescription
            }))
        });
    } catch (error) {
        next(error);
    }
};

// Update user profile fields
const updateUserProfile = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
        const user = await User.findById(req.user._id);
        if (!user) return res.status(404).json({ message: 'User not found' });

        const updates = req.body.profile || {};
        const fields = ['displayName', 'gender', 'birthDate', 'location', 'bio', 'broadcastMessage'];
        
        fields.forEach(field => {
            if (updates[field] !== undefined) user.profile[field] = updates[field];
        });

        const updatedUser = await user.save();
        const userInterests = await UserInterest.find({ userId: updatedUser._id }).populate('interestId', 'name category');

        res.json({
            ...updatedUser.toObject({ virtuals: true }),
            interests: userInterests.map(ui => ({
                userInterestId: ui._id,
                interest: ui.interestId,
                customDescription: ui.customDescription
            }))
        });
    } catch (error) {
        if (error.code === 11000) return res.status(400).json({ message: 'Conflict detected' });
        next(error);
    }
};

// Self-deletion of user account
const deleteOwnAccount = async (req, res, next) => {
    try {
        const user = await User.findById(req.user._id);
        if (!user) return res.status(404).json({ message: 'User not found' });
        if (user.isDeleted) return res.status(400).json({ message: 'Already deleted' });

        // Cleanup Avatar if exists
        if (user.profile?.avatarUrl) {
            const avatarPath = path.join(__dirname, '..', user.profile.avatarUrl.replace(/^\//, ''));
            if (fs.existsSync(avatarPath)) {
                fs.unlink(avatarPath, () => {});
            }
        }

        await UserInterest.deleteMany({ userId: user._id });

        user.isDeleted = true;
        user.deletedAt = new Date();
        await user.save({ validateBeforeSave: false });

        res.status(200).json({ message: 'Account deleted' });
    } catch (error) {
        next(error);
    }
};

// Search for users
const findUsers = async (req, res, next) => {
    const queryParam = req.query.q;
    const isObjectId = mongoose.Types.ObjectId.isValid(queryParam);

    try {
        const query = {
            _id: { $ne: req.user._id },
            isDeleted: false,
            isBanned: false
        };

        if (isObjectId) {
            query._id = queryParam; 
        } else {
            query.$or = [
                { username: { $regex: queryParam, $options: 'i' } },
                { 'profile.displayName': { $regex: queryParam, $options: 'i' } }
            ];
        }

        const users = await User.find(query).select('username email profile');
        res.json(users);
    } catch (error) {
        next(error);
    }
};

// Get public profile of another user
const getUserById = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
        const user = await User.findOne({
            _id: req.params.id,
            isDeleted: false,
            isBanned: false
        }).select('username email profile');

        if (!user) return res.status(404).json({ message: 'User not found' });

        const userInterests = await UserInterest.find({ userId: user._id })
            .populate('interestId', 'name category');

        res.json({
            ...user.toObject(),
            interests: userInterests.map(ui => ({
                userInterestId: ui._id,
                interest: ui.interestId,
                customDescription: ui.customDescription
            }))
        });
    } catch (error) {
        next(error);
    }
};

// --- Interest Management ---

const addUserInterest = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { interestId, customDescription } = req.body;
    const userId = req.user._id;

    try {
        const interest = await Interest.findById(interestId);
        if (!interest) return res.status(404).json({ message: 'Interest not found' });
        if (interest.isArchived) return res.status(400).json({ message: 'Interest archived' });

        const exists = await UserInterest.exists({ userId, interestId });
        if (exists) return res.status(400).json({ message: 'Already added' });

        const newUserInterest = await UserInterest.create({
            userId,
            interestId,
            customDescription: customDescription || ''
        });

        const populated = await UserInterest.findById(newUserInterest._id).populate('interestId', 'name category isArchived');
        res.status(201).json(populated);
    } catch (error) {
        if (error.code === 11000) return res.status(400).json({ message: 'Duplicate interest' });
        next(error);
    }
};

const updateUserInterest = async (req, res, next) => {
    const { customDescription } = req.body;
    if (customDescription === undefined) return res.status(400).json({ message: 'Description required' });

    try {
        const userInterest = await UserInterest.findOne({ _id: req.params.userInterestId, userId: req.user._id });
        if (!userInterest) return res.status(404).json({ message: 'Interest not found' });

        userInterest.customDescription = customDescription;
        await userInterest.save();

        const populated = await UserInterest.findById(userInterest._id).populate('interestId', 'name category');
        
        res.json({
            userInterestId: populated._id,
            interest: populated.interestId,
            customDescription: populated.customDescription
        });
    } catch (error) {
        next(error);
    }
};

const removeUserInterest = async (req, res, next) => {
    try {
        const result = await UserInterest.deleteOne({ _id: req.params.userInterestId, userId: req.user._id });
        if (result.deletedCount === 0) return res.status(404).json({ message: 'Interest not found' });

        res.json({ message: 'Removed' });
    } catch (error) {
        next(error);
    }
};

// --- Avatar Management ---

const updateUserAvatar = async (req, res, next) => {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

    try {
        const user = await User.findById(req.user._id);
        if (!user) {
            // Cleanup orphan file
            fs.unlink(req.file.path, () => {});
            return res.status(404).json({ message: 'User not found' });
        }

        // Remove old avatar if custom
        if (user.profile.avatarUrl && !user.profile.avatarUrl.includes('default')) {
            const oldPath = path.join(__dirname, '..', 'public', user.profile.avatarUrl.replace('/public/', ''));
            if (fs.existsSync(oldPath)) fs.unlink(oldPath, () => {});
        }

        const relativePath = `/public/uploads/avatars/${req.file.filename}`;
        user.profile.avatarUrl = relativePath;
        await user.save();

        res.json({
            message: 'Avatar updated',
            avatarUrl: relativePath,
            user: { _id: user._id, username: user.username, profile: user.profile }
        });
    } catch (error) {
        // Cleanup uploaded file on error
        fs.unlink(req.file.path, () => {});
        next(error);
    }
};

module.exports = {
    getUserProfile,
    updateUserProfile,
    deleteOwnAccount,
    findUsers,
    getUserById,
    addUserInterest,
    updateUserInterest,
    removeUserInterest,
    updateUserAvatar
};