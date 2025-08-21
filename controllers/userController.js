// controllers/userController.js
const User = require('../models/User');
const UserInterest = require('../models/UserInterest');
const Interest = require('../models/Interest'); 
const logAuditEvent = require('../utils/auditLogger'); // Dodaj, jeśli potrzebne
const fs = require('fs'); // Do usuwania starych avatarów
const path = require('path');
const { validationResult } = require('express-validator');

// @desc    Get current user profile (optionally populated)
// @route   GET /api/users/profile
// @access  Private
const getUserProfile = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
  try {
    // req.user jest już pobrany przez middleware 'protect' bez hasła
    // Opcjonalnie: Pobierz i dołącz zainteresowania użytkownika
    const userInterests = await UserInterest.find({ userId: req.user._id })
                                            .populate('interestId', 'name category'); // Pobierz nazwę i kategorię zainteresowania



    // Zwróć profil razem z zainteresowaniami
    res.json({
        ...req.user.toObject(), // Konwertuj dokument Mongoose na zwykły obiekt
        interests: userInterests.map(ui => ({ // Uprość strukturę zainteresowań
            userInterestId: ui._id, // ID wpisu UserInterest (do usuwania/edycji)
            interest: ui.interestId, // Obiekt Interest
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
        // user.profile.avatarUrl - to będzie aktualizowane przez osobny endpoint
        user.profile.gender = profileUpdates.gender || user.profile.gender;
        user.profile.birthDate = profileUpdates.birthDate || user.profile.birthDate;
        user.profile.location = profileUpdates.location || user.profile.location;
        user.profile.bio = profileUpdates.bio || user.profile.bio;
        user.profile.broadcastMessage = profileUpdates.broadcastMessage || user.profile.broadcastMessage;

        const updatedUser = await user.save();
        const userInterests = await UserInterest.find({ userId: updatedUser._id }).populate('interestId', 'name category');
        await logAuditEvent('user_profile_updated_text', { type: 'user', id: req.user._id }, 'info', {}, { updatedFields: Object.keys(profileUpdates) }, req);
        res.json({
            ...updatedUser.toObject({ virtuals: true }), // Dodaj virtuals jeśli masz np. age
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
         // Obsługa błędu duplikatu jeśli zmieniasz email/username
         if (error.code === 11000) {
             return res.status(400).json({ message: 'Username or Email already taken' });
         }
         res.status(500).json({ message: 'Server Error updating profile' });
    }
};

// @desc    Find users by username or display name
// @route   GET /api/users/search?q=...
// @access  Private
const findUsers = async (req, res, next) => { // Dodano next
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    const queryParam = req.query.q;

    const keywordConditions = [
        { username: { $regex: queryParam, $options: 'i' } },
        { 'profile.displayName': { $regex: queryParam, $options: 'i' } }
    ];

    try {
        const users = await User.find({
            $or: keywordConditions,
            _id: { $ne: req.user._id }, // Wyklucz samego siebie
            isDeleted: false,           // --- POPRAWKA ---
            isBanned: false             // --- POPRAWKA ---
        }).select('username email profile');

        res.json(users);
    } catch (error) {
        console.error('[userController.js] Search Users Error:', error);
        next(error); // Przekaż do globalnego error handlera
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

    // To sprawdzenie nie jest już potrzebne, bo express-validator robi to w trasie
    // if (!interestId) {
    //     return res.status(400).json({ message: 'Interest ID is required' });
    // }

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

        // Logowanie zdarzenia
        await logAuditEvent('user_added_interest', { type: 'user', id: userId }, 'info', { type: 'interest', id: interestId }, { userInterestId: newUserInterest._id }, req);

        // Zwróć nowo dodane zainteresowanie z populacją
        const populatedInterest = await UserInterest.findById(newUserInterest._id)
                                                  .populate('interestId', 'name category isArchived');

        res.status(201).json(populatedInterest.toObject()); // Użyj .toObject() dla spójności

    } catch (error) {
        console.error('[userController] Add User Interest Error:', error);
         if (error.code === 11000) {
             return res.status(400).json({ message: 'Interest already added to profile (database constraint).' });
         }
        next(error); // Przekaż do globalnego error handlera
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

    if (customDescription === undefined) { // Pozwól na ustawienie pustego opisu
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

        await userInterest.deleteOne(); // Użyj deleteOne() zamiast remove()

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
    if (!req.file) { // req.file jest dodawane przez multer
        return res.status(400).json({ message: 'No avatar image file uploaded.' });
    }

    try {
        const user = await User.findById(req.user._id);
        if (!user) {
            // Usuń wgrany plik, jeśli użytkownik nie istnieje (choć to nie powinno się zdarzyć z protect)
            fs.unlink(req.file.path, (err) => { if (err) console.error("Error deleting orphaned avatar:", err); });
            return res.status(404).json({ message: 'User not found.' });
        }

        // Usuń stary avatar, jeśli istnieje i nie jest domyślnym
        if (user.profile.avatarUrl && !user.profile.avatarUrl.includes('default')) { // Załóżmy, że domyślne avatary nie są w /public/uploads
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

        // Zapisz ścieżkę do nowego avatara
        // req.file.path to pełna ścieżka systemowa
        // Chcemy zapisać względny URL dostępny przez serwer statyczny
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
            avatarUrl: relativePath, // Zwróć nowy URL avatara
            user: { // Możesz zwrócić zaktualizowany obiekt użytkownika
                _id: user._id,
                username: user.username,
                profile: user.profile
            }
        });

    } catch (error) {
        console.error('Update Avatar Error:', error);
        // Usuń wgrany plik w przypadku błędu zapisu do bazy
        fs.unlink(req.file.path, (err) => { if (err) console.error("Error deleting uploaded avatar on DB error:", err); });
        await logAuditEvent('user_avatar_update_error', { type: 'user', id: req.user._id }, 'error', {}, { error: error.message }, req);
        res.status(500).json({ message: 'Server error updating avatar.' });
    }
};


module.exports = {
    getUserProfile,
    updateUserProfile,
    findUsers,
    addUserInterest, // Dodane
    updateUserInterest, // Dodane
    removeUserInterest, // Dodane
    updateUserAvatar,
};