const User = require('../models/User');
const { validationResult } = require('express-validator');
const crypto = require('crypto');

// Saves a full key backup (public/private keys + encryption params)
const saveBackup = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
        const userId = req.user._id;
        
        // Construct the nested update object
        const backupData = {};
        const fields = [
            'publicKey', 
            'encryptedPrivateKey', 
            'encryptedBackupKey', 
            'passwordDerivationParams', 
            'backupEncryptionParams', 
            'privateEncryptionParams'
        ];

        fields.forEach(field => {
            if (req.body[field]) backupData[`backup.${field}`] = req.body[field];
        });

        const user = await User.findByIdAndUpdate(userId, { $set: backupData }, { new: true });

        if (!user) return res.status(404).json({ message: "User not found" });
        
        res.status(200).json({ message: 'Backup saved successfully' });
    } catch (error) {
        console.error('Save Backup Error:', error.message);
        next(error);
    }
};

// Retrieves the user's encrypted backup data
const getBackup = async (req, res, next) => {
    try {
        const user = await User.findById(req.user._id).select('+backup');

        if (!user?.backup?.encryptedBackupKey) {
            return res.status(404).json({ message: 'No backup found' });
        }
        
        res.status(200).json(user.backup);
    } catch (error) {
        next(error);
    }
};

// Updates only the password-related backup components (e.g. after password change)
const updateBackupPassword = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { encryptedBackupKey, passwordDerivationParams, backupEncryptionParams } = req.body;

    try {
        const user = await User.findById(req.user._id).select('+backup');
        
        if (!user?.backup?.encryptedPrivateKey) {
            return res.status(404).json({ message: "No existing backup to update" });
        }

        user.backup.encryptedBackupKey = encryptedBackupKey;
        if (passwordDerivationParams) user.backup.passwordDerivationParams = passwordDerivationParams;
        if (backupEncryptionParams) user.backup.backupEncryptionParams = backupEncryptionParams;

        await user.save();

        res.status(200).json({ message: 'Backup password updated' });
    } catch (error) {
        console.error('Update Backup Password Error:', error.message);
        next(error);
    }
};

// Verifies if the supplied password verifier matches the stored one
const verifyBackupPassword = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { passwordVerifier } = req.body;

    try {
        const user = await User.findById(req.user._id).select('+backup');

        const storedVerificator = user?.backup?.passwordDerivationParams?.verificator;

        if (!storedVerificator) {
            return res.status(404).json({ message: "No backup verifier found" });
        }

        const storedBuf = Buffer.from(storedVerificator, 'base64');
        const suppliedBuf = Buffer.from(passwordVerifier, 'base64');

        if (storedBuf.length !== suppliedBuf.length) {
             return res.status(400).json({ valid: false, message: "Invalid password" });
        }

        const isValid = crypto.timingSafeEqual(storedBuf, suppliedBuf);

        if (isValid) {
            res.status(200).json({ valid: true, message: "Password correct" });
        } else {
            res.status(400).json({ valid: false, message: "Invalid password" });
        }
    } catch (error) {
        console.error('Verify Backup Error:', error.message);
        next(error);
    }
};

module.exports = { saveBackup, getBackup, updateBackupPassword, verifyBackupPassword };