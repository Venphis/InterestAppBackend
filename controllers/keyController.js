// controllers/keyController.js
const User = require('../models/User');
const { validationResult } = require('express-validator');

// @desc    Publish or update the logged-in user's public key
// @route   POST /api/keys/publish
// @access  Private
const publishPublicKey = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { publicKey } = req.body;
    const userId = req.user._id;

    try {
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: 'User not found.' });

        // Jeśli klucz już istnieje, logujemy aktualizację. Jeśli nie, logujemy publikację.
        const action = user.publicKey ? 'user_updated_public_key' : 'user_published_public_key';
        
        user.publicKey = publicKey;
        await user.save({ validateBeforeSave: false });

        res.status(200).json({ message: 'Public key published successfully.' });
    } catch (error) {
        console.error('[keyController] Publish Public Key Error:', error);
        next(error);
    }
};

// @desc    Get the public key for a specific user
// @route   GET /api/keys/:userId
// @access  Private
const getPublicKey = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { userId } = req.params;

    try {
        const user = await User.findById(userId)
                               .select('publicKey username profile.displayName') // Zwróć też username/displayName do weryfikacji
                               .where({ isDeleted: false, isBanned: false });

        if (!user || !user.publicKey) {
            return res.status(404).json({ message: 'User not found or has not published a public key.' });
        }

        res.status(200).json({
            userId: user._id,
            username: user.username,
            displayName: user.profile.displayName,
            publicKey: user.publicKey
        });
    } catch (error) {
        console.error('[keyController] Get Public Key Error:', error);
        next(error);
    }
};

module.exports = { publishPublicKey, getPublicKey }; // Zmieniono getPublicKeys na getPublicKey