// controllers/userController.js
const User = require('../models/User');
const UserInterest = require('../models/UserInterest');
const Interest = require('../models/Interest'); // Potrzebne do walidacji

// @desc    Get current user profile (optionally populated)
// @route   GET /api/users/profile
// @access  Private
const getUserProfile = async (req, res) => {
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
    console.error('Get Profile Error:', error);
    res.status(500).json({ message: 'Server Error getting profile' });
  }
};

// @desc    Update user profile
// @route   PUT /api/users/profile
// @access  Private
const updateUserProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Aktualizuj pola profilu, jeśli zostały przesłane
        const profileUpdates = req.body.profile || {};
        user.profile.displayName = profileUpdates.displayName || user.profile.displayName;
        user.profile.avatarUrl = profileUpdates.avatarUrl || user.profile.avatarUrl;
        user.profile.gender = profileUpdates.gender || user.profile.gender;
        user.profile.birthDate = profileUpdates.birthDate || user.profile.birthDate;
        user.profile.location = profileUpdates.location || user.profile.location;
        user.profile.bio = profileUpdates.bio || user.profile.bio;
        user.profile.broadcastMessage = profileUpdates.broadcastMessage || user.profile.broadcastMessage;

        // Opcjonalnie: Aktualizacja email/username (wymaga ostrożności i walidacji unikalności)
        // user.username = req.body.username || user.username;
        // user.email = req.body.email || user.email;

        const updatedUser = await user.save();

         // Pobierz zaktualizowane zainteresowania (jeśli chcesz zwrócić pełny profil)
        const userInterests = await UserInterest.find({ userId: updatedUser._id })
                                                .populate('interestId', 'name category');

        res.json({
            ...updatedUser.toObject(),
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
const findUsers = async (req, res) => {
    const query = req.query.q;
    if (!query) {
        return res.status(400).json({ message: 'Search query "q" is required' });
    }

    const keyword = {
        $or: [
            { username: { $regex: query, $options: 'i' } },
            { 'profile.displayName': { $regex: query, $options: 'i' } }
        ],
        _id: { $ne: req.user._id } // Wyklucz samego siebie
    };

    try {
        const users = await User.find(keyword).select('username email profile'); // Zwróć wybrane pola
        res.json(users);
    } catch (error) {
        console.error('Search Users Error:', error);
        res.status(500).json({ message: 'Server Error searching users' });
    }
};


// --- Kontrolery Zainteresowań Użytkownika ---

// @desc    Get all predefined interests (optional)
// @route   GET /api/interests
// @access  Public or Private
const getAllInterests = async (req, res) => {
    try {
        const interests = await Interest.find().sort('name');
        res.json(interests);
    } catch (error) {
        console.error('Get All Interests Error:', error);
        res.status(500).json({ message: 'Server Error fetching interests' });
    }
};


// @desc    Add an interest to the logged-in user's profile
// @route   POST /api/users/profile/interests
// @access  Private
const addUserInterest = async (req, res) => {
    const { interestId, customDescription } = req.body;
    const userId = req.user._id;

    if (!interestId) {
        return res.status(400).json({ message: 'Interest ID is required' });
    }

    try {
        // Sprawdź czy zainteresowanie istnieje
        const interestExists = await Interest.findById(interestId);
        if (!interestExists) {
            return res.status(404).json({ message: 'Interest not found' });
        }

        // Sprawdź czy użytkownik już ma to zainteresowanie (indeks w modelu też to robi, ale lepiej sprawdzić)
        const existingUserInterest = await UserInterest.findOne({ userId, interestId });
        if (existingUserInterest) {
            return res.status(400).json({ message: 'Interest already added to profile' });
        }

        // Stwórz nowy wpis UserInterest
        const newUserInterest = await UserInterest.create({
            userId,
            interestId,
            customDescription: customDescription || '' // Ustaw pusty string jeśli nie podano
        });

        // Zwróć nowo dodane zainteresowanie z populacją
        const populatedInterest = await UserInterest.findById(newUserInterest._id)
                                                  .populate('interestId', 'name category');

        res.status(201).json({
            userInterestId: populatedInterest._id,
            interest: populatedInterest.interestId,
            customDescription: populatedInterest.customDescription
        });

    } catch (error) {
        console.error('Add User Interest Error:', error);
         // Obsługa błędu unikalności (jeśli jakimś cudem sprawdzenie wyżej zawiedzie)
         if (error.code === 11000) {
             return res.status(400).json({ message: 'Interest already added to profile' });
         }
        res.status(500).json({ message: 'Server Error adding interest' });
    }
};

// @desc    Update custom description for a user interest
// @route   PUT /api/users/profile/interests/:userInterestId
// @access  Private
const updateUserInterest = async (req, res) => {
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


module.exports = {
    getUserProfile,
    updateUserProfile,
    findUsers,
    getAllInterests, // Dodane
    addUserInterest, // Dodane
    updateUserInterest, // Dodane
    removeUserInterest, // Dodane
};