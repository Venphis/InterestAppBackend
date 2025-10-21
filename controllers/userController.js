const User = require('../models/User');
const UserInterest = require('../models/UserInterest');
const Interest = require('../models/Interest'); 
const logAuditEvent = require('../utils/auditLogger');
const fs = require('fs');
const path = require('path');
const { validationResult } = require('express-validator');
const mongoose = require('mongoose');

// @desc    Get current user profile (optionally populated)
// @route   GET /api/users/profile
// @access  Private
const getUserProfile = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
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
    console.error(`[userController.js] ERROR in getUserProfile for user ${req.user ? req.user._id : 'UNKNOWN'}:`, error);
        next(error);
  }
};

// @desc    Update user profile
// @route   PUT /api/users/profile
// @access  Private
const updateUserProfile = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    try {
        const user = await User.findById(req.user._id);
        if (!user) return res.status(404).json({ message: 'User not found' });

        const profileUpdates = req.body.profile || {};
        user.profile.displayName = profileUpdates.displayName || user.profile.displayName;
        user.profile.gender = profileUpdates.gender || user.profile.gender;
        user.profile.birthDate = profileUpdates.birthDate || user.profile.birthDate;
        user.profile.location = profileUpdates.location || user.profile.location;
        user.profile.bio = profileUpdates.bio || user.profile.bio;
        user.profile.broadcastMessage = profileUpdates.broadcastMessage || user.profile.broadcastMessage;

        const updatedUser = await user.save();
        const userInterests = await UserInterest.find({ userId: updatedUser._id }).populate('interestId', 'name category');
        await logAuditEvent('user_profile_updated_text', { type: 'user', id: req.user._id }, 'info', {}, { updatedFields: Object.keys(profileUpdates) }, req);
        res.json({
            ...updatedUser.toObject({ virtuals: true }), 
             interests: userInterests.map(ui => ({
                userInterestId: ui._id,
                interest: ui.interestId,
                customDescription: ui.customDescription
            }))
        });
    } catch (error) {
         console.error('Update Profile Error:', error);
         if (error.name === 'ValidationError') {
             const messages = Object.values(error.errors).map(val => val.message);
             return res.status(400).json({ message: messages.join(', ') });
         }
         if (error.code === 11000) {
             return res.status(400).json({ message: 'Username or Email already taken' });
         }
         res.status(500).json({ message: 'Server Error updating profile' });
    }
};

// @desc    Find users by username, display name, or ID
// @route   GET /api/users/search?q=...
// @access  Private
const findUsers = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const queryParam = req.query.q;

    const isObjectId = mongoose.Types.ObjectId.isValid(queryParam);

    try {
        let users;

        if (isObjectId) {
            users = await User.findOne({
                _id: queryParam,
                _id: { $ne: req.user._id }, // exclude self
                isDeleted: false,
                isBanned: false
            }).select('username email profile');

            users = users ? [users] : [];
        } else {
            const keywordConditions = [
                { username: { $regex: queryParam, $options: 'i' } },
                { 'profile.displayName': { $regex: queryParam, $options: 'i' } }
            ];

            users = await User.find({
                $or: keywordConditions,
                _id: { $ne: req.user._id },
                isDeleted: false,
                isBanned: false
            }).select('username email profile');
        }

        res.json(users);
    } catch (error) {
        console.error('[userController.js] Search Users Error:', error);
        next(error); 
    }
};


// @desc    fetch a single user by id
// @route   GET /api/users/:id
// @access  Private
const getUserById = async (req, res, next) => {
  const userId = req.params.id;

  try {
    const user = await User.findOne({
      _id: userId,
      isDeleted: false,
      isBanned: false
    }).select('username email profile');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const userInterests = await UserInterest.find({ userId: userId })
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
    console.error('[userController.js] Get User by ID Error:', error);
    next(error);
  }
};



// --- Kontrolery Zainteresowań Użytkownika ---


// @desc    Add an interest to the logged-in user's profile
// @route   POST /api/users/profile/interests
// @access  Private
const addUserInterest = async (req, res, next) => { // Dodaj next
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    const { interestId, customDescription } = req.body;
    const userId = req.user._id;

    try {
        const interest = await Interest.findById(interestId);
        if (!interest) {
            return res.status(404).json({ message: 'Interest not found' });
        }
        if (interest.isArchived) {
            return res.status(400).json({ message: 'Cannot add an archived interest' });
        }
        const existingUserInterest = await UserInterest.findOne({ userId, interestId });
        if (existingUserInterest) {
            return res.status(400).json({ message: 'Interest already added to profile' });
        }
        const newUserInterest = await UserInterest.create({
            userId,
            interestId,
            customDescription: customDescription || ''
        });

        await logAuditEvent('user_added_interest', { type: 'user', id: userId }, 'info', { type: 'interest', id: interestId }, { userInterestId: newUserInterest._id }, req);

        const populatedInterest = await UserInterest.findById(newUserInterest._id)
                                                  .populate('interestId', 'name category isArchived');

        res.status(201).json(populatedInterest.toObject()); 

    } catch (error) {
        console.error('[userController] Add User Interest Error:', error);
         if (error.code === 11000) {
             return res.status(400).json({ message: 'Interest already added to profile (database constraint).' });
         }
        next(error); 
    }
};

// @desc    Update custom description for a user interest
// @route   PUT /api/users/profile/interests/:userInterestId
// @access  Private
const updateUserInterest = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    const { userInterestId } = req.params;
    const { customDescription } = req.body;
    const userId = req.user._id;

    if (customDescription === undefined) { 
         return res.status(400).json({ message: 'customDescription is required in body' });
    }

    try {
        const userInterest = await UserInterest.findOne({ _id: userInterestId, userId: userId });

        if (!userInterest) {
            return res.status(404).json({ message: 'Interest not found on user profile or you do not have permission' });
        }

        userInterest.customDescription = customDescription;
        await userInterest.save();

         const populatedInterest = await UserInterest.findById(userInterest._id)
                                                  .populate('interestId', 'name category');


        res.json({
            userInterestId: populatedInterest._id,
            interest: populatedInterest.interestId,
            customDescription: populatedInterest.customDescription
        });

    } catch (error) {
        console.error('Update User Interest Error:', error);
        res.status(500).json({ message: 'Server Error updating interest description' });
    }
};

// @desc    Remove an interest from the logged-in user's profile
// @route   DELETE /api/users/profile/interests/:userInterestId
// @access  Private
const removeUserInterest = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    const { userInterestId } = req.params;
    const userId = req.user._id;

    try {
        const userInterest = await UserInterest.findOne({ _id: userInterestId, userId: userId });

        if (!userInterest) {
            return res.status(404).json({ message: 'Interest not found on user profile or you do not have permission' });
        }

        await userInterest.deleteOne(); 

        res.status(200).json({ message: 'Interest removed successfully' });

    } catch (error) {
        console.error('Remove User Interest Error:', error);
        res.status(500).json({ message: 'Server Error removing interest' });
    }
};


// @desc    Update user avatar
// @route   PUT /api/users/profile/avatar
// @access  Private
const updateUserAvatar = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    if (!req.file) { 
        return res.status(400).json({ message: 'No avatar image file uploaded.' });
    }

    try {
        const user = await User.findById(req.user._id);
        if (!user) {
            fs.unlink(req.file.path, (err) => { if (err) console.error("Error deleting orphaned avatar:", err); });
            return res.status(404).json({ message: 'User not found.' });
        }

        if (user.profile.avatarUrl && !user.profile.avatarUrl.includes('default')) { 
            const oldAvatarPathName = user.profile.avatarUrl.split('/public/')[1];
            if (oldAvatarPathName) {
                const oldAvatarFullPath = path.join(__dirname, '..', 'public', oldAvatarPathName);
                 if (fs.existsSync(oldAvatarFullPath)) {
                    fs.unlink(oldAvatarFullPath, (err) => {
                        if (err) console.error("Error deleting old avatar:", err);
                    });
                }
            }
        }

        const relativePath = `/public/uploads/avatars/${req.file.filename}`;
        user.profile.avatarUrl = relativePath;
        await user.save();

        await logAuditEvent(
            'user_avatar_updated',
            { type: 'user', id: req.user._id },
            'info', {}, { newAvatarPath: relativePath }, req
        );

        res.json({
            message: 'Avatar updated successfully.',
            avatarUrl: relativePath, 
            user: { 
                _id: user._id,
                username: user.username,
                profile: user.profile
            }
        });

    } catch (error) {
        console.error('Update Avatar Error:', error);
        fs.unlink(req.file.path, (err) => { if (err) console.error("Error deleting uploaded avatar on DB error:", err); });
        await logAuditEvent('user_avatar_update_error', { type: 'user', id: req.user._id }, 'error', {}, { error: error.message }, req);
        res.status(500).json({ message: 'Server error updating avatar.' });
    }
};


module.exports = {
    getUserProfile,
    updateUserProfile,
    findUsers,
    addUserInterest, 
    updateUserInterest, 
    removeUserInterest, 
    updateUserAvatar,
    getUserById
};
