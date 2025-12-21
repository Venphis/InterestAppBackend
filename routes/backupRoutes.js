// routes/backupRoutes.js
const express = require('express');
const { body } = require('express-validator');
const { protect } = require('../middleware/authMiddleware');
const {
    saveBackup,
    getBackup,
    updateBackupPassword,
    verifyBackupPassword
} = require('../controllers/backupController');
const router = express.Router();

router.use(protect);

router.post('/', [
    // Walidacja encryptedPrivateKey (obiekt)
    body('encryptedPrivateKey').isObject().withMessage('encryptedPrivateKey must be an object'),
    body('encryptedPrivateKey.iv').isString().notEmpty().withMessage('encryptedPrivateKey.iv is required'),
    body('encryptedPrivateKey.tag').isString().notEmpty().withMessage('encryptedPrivateKey.tag is required'),
    body('encryptedPrivateKey.ciphertext').isString().notEmpty().withMessage('encryptedPrivateKey.ciphertext is required'),

    // Walidacja encryptedBackupKey (obiekt)
    body('encryptedBackupKey').isObject().withMessage('encryptedBackupKey must be an object'),
    body('encryptedBackupKey.iv').isString().notEmpty().withMessage('encryptedBackupKey.iv is required'),
    body('encryptedBackupKey.tag').isString().notEmpty().withMessage('encryptedBackupKey.tag is required'),
    body('encryptedBackupKey.ciphertext').isString().notEmpty().withMessage('encryptedBackupKey.ciphertext is required'),

    // Walidacja passwordDerivationParams (obiekt)
    body('passwordDerivationParams').isObject().withMessage('passwordDerivationParams must be an object.'),
    body('passwordDerivationParams.algorithm').isString().notEmpty().withMessage('Algorithm is required.'),
    body('passwordDerivationParams.salt').isString().notEmpty().withMessage('Salt must be a string.'), // Zmieniono z isBase64 na isString dla elastyczności, ale Base64 jest zalecany
    body('passwordDerivationParams.opsLimit').isInt().withMessage('opsLimit must be an integer.'),
    body('passwordDerivationParams.memLimit').isInt().withMessage('memLimit must be an integer.'),
    body('passwordDerivationParams.parallelism').isInt().withMessage('parallelism must be an integer.'),
    body('passwordDerivationParams.hashLength').isInt().withMessage('hashLength must be an integer.'),

    // Walidacja dodatkowych pól
    body('publicKey').isString().notEmpty().withMessage('publicKey is required'),
    body('passwordVerifier').isString().notEmpty().withMessage('passwordVerifier is required') // Zmieniono z isBase64 na isString
], saveBackup);

router.get('/', getBackup);

router.put('/password', [
    // Walidacja encryptedBackupKey (obiekt) - przy zmianie hasła
    body('encryptedBackupKey').isObject().withMessage('New encryptedBackupKey must be an object.'),
    body('encryptedBackupKey.iv').isString().notEmpty().withMessage('encryptedBackupKey.iv is required'),
    body('encryptedBackupKey.tag').isString().notEmpty().withMessage('encryptedBackupKey.tag is required'),
    body('encryptedBackupKey.ciphertext').isString().notEmpty().withMessage('encryptedBackupKey.ciphertext is required'),

    // Walidacja passwordDerivationParams (opcjonalne przy zmianie hasła, ale jeśli jest, to pełne)
    body('passwordDerivationParams').optional().isObject(),
    body('passwordDerivationParams.algorithm').optional().isString().notEmpty(),
    body('passwordDerivationParams.salt').optional().isString().notEmpty(),
    body('passwordDerivationParams.opsLimit').optional().isInt(),
    body('passwordDerivationParams.memLimit').optional().isInt(),
    body('passwordDerivationParams.parallelism').optional().isInt(),
    body('passwordDerivationParams.hashLength').optional().isInt(),

    body('passwordVerifier').isString().notEmpty().withMessage('passwordVerifier is required for password change')
], updateBackupPassword);

router.post('/verify-password', [
    body('passwordVerifier').isString().notEmpty().withMessage('passwordVerifier is required')
], verifyBackupPassword);

module.exports = router;