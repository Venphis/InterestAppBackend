// controllers/keyController.js
const User = require('../models/User');
const { validationResult } = require('express-validator');

const publishPublicKey = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { publicKey } = req.body;
    const userId = req.user._id;

    try {
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: 'User not found.' });

        user.publicKey = publicKey;
        await user.save({ validateBeforeSave: false }); // Zapisz bez walidacji innych pól

        res.status(200).json({ message: 'Public key published successfully.' });
    } catch (error) {
        next(error);
    }
};

const getPublicKeys = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { userId } = req.params;

    try {
        // Pobierz tylko klucz publiczny, nic więcej
        const user = await User.findById(userId)
                               .select('publicKey username') // Zwróć też username dla weryfikacji po stronie klienta
                               .where({ isDeleted: false, isBanned: false });

        if (!user || !user.publicKey) {
            return res.status(404).json({ message: 'User not found or has not published a public key.' });
        }

        res.status(200).json({
            userId: user._id,
            username: user.username,
            publicKey: user.publicKey
        });
    } catch (error) {
        next(error);
    }
};

module.exports = { publishPublicKey, getPublicKeys };