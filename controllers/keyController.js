const User = require('../models/User');
const Message = require('../models/Message');
const Chat = require('../models/Chat');
const { validationResult } = require('express-validator');
const logAuditEvent = require('../utils/auditLogger');

// Publish or rotate user's public key
const publishPublicKey = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { publicKey } = req.body;
    const userId = req.user._id;

    try {
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: 'User not found' });

        const isRotation = !!user.publicKey;

        user.publicKey = publicKey;
        await user.save({ validateBeforeSave: false });

        if (isRotation) {
            // Security Protocol: Wipe all chat history upon key rotation
            // as old messages can no longer be decrypted by peers.
            const userChats = await Chat.find({ participants: userId }).select('_id');
            const chatIds = userChats.map(c => c._id);

            if (chatIds.length > 0) {
                await Message.deleteMany({ chatId: { $in: chatIds } });
                
                await Chat.updateMany(
                    { _id: { $in: chatIds } },
                    { 
                        $unset: { lastMessage: "", lastMessageTimestamp: "" },
                        $set: { lastResetDate: new Date() } 
                    }
                );
            }

            await logAuditEvent('user_rotated_key_history_wiped', { type: 'user', id: userId }, 'warn', {}, { chatsAffected: chatIds.length }, req);
            return res.status(200).json({ message: 'Key rotated. Chat history wiped for security.' });
        } else {
            await logAuditEvent('user_published_initial_key', { type: 'user', id: userId }, 'info', {}, {}, req);
            return res.status(200).json({ message: 'Public key published.' });
        }

    } catch (error) {
        console.error('Publish Key Error:', error.message);
        next(error);
    }
};

// Retrieve a user's public key
const getPublicKey = async (req, res, next) => {
    try {
        const user = await User.findById(req.params.userId)
            .select('publicKey username profile.displayName')
            .where({ isDeleted: false, isBanned: false });

        if (!user?.publicKey) {
            return res.status(404).json({ message: 'User key not found' });
        }

        res.status(200).json({
            userId: user._id,
            username: user.username,
            displayName: user.profile?.displayName,
            publicKey: user.publicKey
        });
    } catch (error) {
        next(error);
    }
};

module.exports = { publishPublicKey, getPublicKey };