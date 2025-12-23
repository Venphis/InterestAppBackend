// controllers/keyController.js
const User = require('../models/User');
const Message = require('../models/Message'); // <-- DODAJ IMPORT
const Chat = require('../models/Chat');       // <-- DODAJ IMPORT (opcjonalnie, jeśli chcesz czyścić czaty)
const { validationResult } = require('express-validator');
const logAuditEvent = require('../utils/auditLogger');

const publishPublicKey = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { publicKey } = req.body;
    const userId = req.user._id;

    try {
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: 'User not found.' });

        const isUpdate = !!user.publicKey;

        user.publicKey = publicKey;
        // user.lastKeyRotationDate = new Date(); // To też warto zostawić
        await user.save({ validateBeforeSave: false });

        if (isUpdate) {
            // Znajdź czaty użytkownika
            const userChats = await Chat.find({ participants: userId });
            const chatIds = userChats.map(c => c._id);

            if (chatIds.length > 0) {
                // Usuń wszystkie wiadomości z tych czatów
                await Message.deleteMany({ chatId: { $in: chatIds } });

                // Zaktualizuj czaty (wyczyść lastMessage)
                await Chat.updateMany(
                    { _id: { $in: chatIds } },
                    { 
                        $unset: { lastMessage: "", lastMessageTimestamp: "" },
                        $set: { lastResetDate: new Date() } // Opcjonalnie: flaga resetu
                    }
                );
            }
            await logAuditEvent('user_rotated_key_wiped_history', { type: 'user', id: userId }, 'warn', {}, { chatsAffected: chatIds.length }, req);
             res.status(200).json({ message: 'Public key updated. Chat history cleared for security.' }); // Inny komunikat
        } else {
             await logAuditEvent('user_published_public_key', { type: 'user', id: userId }, 'info', {}, {}, req);
             res.status(200).json({ message: 'Public key published successfully.' });
        }

    } catch (error) {
        console.error('[keyController] Publish Key Error:', error);
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