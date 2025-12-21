// controllers/backupController.js
const User = require('../models/User');
const { validationResult } = require('express-validator');
const logAuditEvent = require('../utils/auditLogger');
const crypto = require('crypto');

// @desc    Save encrypted key backup for the logged-in user
// @route   POST /api/backups
// @access  Private
const saveBackup = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { encryptedPrivateKey, encryptedBackupKey, passwordDerivationParams, publicKey, passwordVerifier } = req.body;
    const userId = req.user._id;

    try {
        const updateData = {
            'backup.encryptedPrivateKey': encryptedPrivateKey,
            'backup.encryptedBackupKey': encryptedBackupKey,
            'backup.passwordDerivationParams': passwordDerivationParams,
            'backup.publicKey': publicKey,
            'backup.passwordVerifier': passwordVerifier
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

const updateBackupPassword = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { encryptedBackupKey, passwordDerivationParams, passwordVerifier } = req.body
    const userId = req.user._id;

    try {
        // Sprawdź, czy użytkownik ma już backup. Jeśli nie, nie może zmienić hasła.
        const user = await User.findById(userId).select('+backup');
        if (!user || !user.backup || !user.backup.encryptedPrivateKey) {
            return res.status(404).json({ message: "No existing backup found to update password for." });
        }

        // Zaktualizuj tylko te pola, które są związane z hasłem
        user.backup.encryptedBackupKey = encryptedBackupKey;
        if (passwordDerivationParams) {
            user.backup.passwordDerivationParams = passwordDerivationParams;
        }

        if (passwordVerifier) {
            user.backup.passwordVerifier = passwordVerifier;
        }

        await user.save(); // `save()` zamiast `findByIdAndUpdate`, bo pracujemy na dokumencie

        await logAuditEvent('user_updated_backup_password', { type: 'user', id: userId }, 'info', {}, {}, req);
        res.status(200).json({ message: 'Backup password components updated successfully.' });

    } catch (error) {
        console.error('[backupController] Update Backup Password Error:', error);
        next(error);
    }
};

const verifyBackupPassword = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { passwordVerifier } = req.body;
    try {
        const user = await User.findById(req.user._id).select('+backup');

        if (!user || !user.backup || !user.backup.passwordVerifier) {
            return res.status(404).json({ message: "No backup or verifier found for this user." });
        }

        const storedVerifier = Buffer.from(user.backup.passwordVerifier, 'base64');
        const suppliedVerifier = Buffer.from(passwordVerifier, 'base64');

        if (storedVerifier.length !== suppliedVerifier.length) {
             return res.status(400).json({ valid: false, message: "Invalid password." });
        }

        const areEqual = crypto.timingSafeEqual(storedVerifier, suppliedVerifier);

        if (areEqual) {
            res.status(200).json({ valid: true, message: "Password is correct." });
        } else {
            res.status(400).json({ valid: false, message: "Invalid password." });
        }
    } catch (error) {
        console.error('[backupController] Verify Backup Password Error:', error);
        next(error);
    }
};

module.exports = { saveBackup, getBackup, updateBackupPassword, verifyBackupPassword}; 