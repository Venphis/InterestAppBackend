// controllers/backupController.js
const User = require('../models/User');
const { validationResult } = require('express-validator');
const logAuditEvent = require('../utils/auditLogger');

// @desc    Save encrypted key backup for the logged-in user
// @route   POST /api/backups
// @access  Private
const saveBackup = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { encryptedPrivateKey, encryptedBackupKey, passwordDerivationParams } = req.body;
    const userId = req.user._id;

    try {
        const updateData = {
            'backup.encryptedPrivateKey': encryptedPrivateKey,
            'backup.encryptedBackupKey': encryptedBackupKey,
            'backup.passwordDerivationParams': passwordDerivationParams
        };

        // Użyj findByIdAndUpdate, aby zaktualizować tylko pola backupu
        const user = await User.findByIdAndUpdate(userId, { $set: updateData }, { new: true });

        if (!user) {
            return res.status(404).json({ message: "User not found." });
        }

        await logAuditEvent('user_saved_key_backup', { type: 'user', id: userId }, 'info', {}, { algorithm: passwordDerivationParams.algorithm }, req);
        res.status(200).json({ message: 'Backup saved successfully.' });
    } catch (error) {
        console.error('[backupController] Save Backup Error:', error);
        next(error);
    }
};

// @desc    Get encrypted key backup for the logged-in user
// @route   GET /api/backups
// @access  Private
const getBackup = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const userId = req.user._id;

    try {
        // Musimy jawnie wybrać pole 'backup', ponieważ ma `select: false` w schemacie
        const user = await User.findById(userId).select('+backup');

        if (!user || !user.backup || !user.backup.encryptedBackupKey) {
            return res.status(404).json({ message: 'No backup found for this user.' });
        }
        
        await logAuditEvent('user_retrieved_key_backup', { type: 'user', id: userId }, 'info', {}, {}, req);
        res.status(200).json(user.backup);
    } catch (error) {
        console.error('[backupController] Get Backup Error:', error);
        next(error);
    }
};

module.exports = { saveBackup, getBackup };