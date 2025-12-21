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
    body('publicKey').isString().notEmpty().withMessage('publicKey is required'),

    body('encryptedPrivateKey').isString().notEmpty().withMessage('encryptedPrivateKey is required (Base64 string)'),
    body('encryptedBackupKey').isString().notEmpty().withMessage('encryptedBackupKey is required (Base64 string)'),

    body('passwordDerivationParams').isObject().withMessage('passwordDerivationParams must be an object'),
    body('passwordDerivationParams.algorithm').isString().notEmpty().withMessage('Algorithm is required'),
    body('passwordDerivationParams.salt').isString().notEmpty().withMessage('Salt must be a string (Base64)'),
    body('passwordDerivationParams.opsLimit').isInt().withMessage('opsLimit must be an integer'),
    body('passwordDerivationParams.memLimit').isInt().withMessage('memLimit must be an integer'),
    body('passwordDerivationParams.parallelism').isInt().withMessage('parallelism must be an integer'),
    body('passwordDerivationParams.hashLength').isInt().withMessage('hashLength must be an integer'),
    body('passwordDerivationParams.verificator').isString().notEmpty().withMessage('verificator is required'),

    body('backupEncryptionParams').isObject().withMessage('backupEncryptionParams must be an object'),
    body('backupEncryptionParams.algorithm').isString().notEmpty().withMessage('backupEncryptionParams.algorithm is required'),
    body('backupEncryptionParams.iv').isString().notEmpty().withMessage('backupEncryptionParams.iv is required'),
    body('backupEncryptionParams.tagLength').isInt().withMessage('backupEncryptionParams.tagLength must be an integer'),

    body('privateEncryptionParams').isObject().withMessage('privateEncryptionParams must be an object'),
    body('privateEncryptionParams.algorithm').isString().notEmpty().withMessage('privateEncryptionParams.algorithm is required'),
    body('privateEncryptionParams.iv').isString().notEmpty().withMessage('privateEncryptionParams.iv is required'),
    body('privateEncryptionParams.tagLength').isInt().withMessage('privateEncryptionParams.tagLength must be an integer')
], saveBackup);

router.get('/', getBackup);

// Pełna walidacja dla zmiany hasła backupu
router.put('/password', [
    // Nowy zaszyfrowany klucz backupowy (zaszyfrowany nowym kluczem z hasła)
    body('encryptedBackupKey').isString().notEmpty().withMessage('New encryptedBackupKey is required (Base64 string)'),

    // Nowe parametry derywacji hasła (ponieważ hasło się zmieniło, sól i weryfikator też się zmieniły)
    body('passwordDerivationParams').isObject().withMessage('New passwordDerivationParams required'),
    body('passwordDerivationParams.algorithm').isString().notEmpty().withMessage('Algorithm is required'),
    body('passwordDerivationParams.salt').isString().notEmpty().withMessage('Salt must be a string (Base64)'),
    body('passwordDerivationParams.opsLimit').isInt().withMessage('opsLimit must be an integer'),
    body('passwordDerivationParams.memLimit').isInt().withMessage('memLimit must be an integer'),
    body('passwordDerivationParams.parallelism').isInt().withMessage('parallelism must be an integer'),
    body('passwordDerivationParams.hashLength').isInt().withMessage('hashLength must be an integer'),
    body('passwordDerivationParams.verificator').isString().notEmpty().withMessage('verificator is required'),

    // Nowe parametry szyfrowania dla klucza backupowego (nowe IV)
    body('backupEncryptionParams').isObject().withMessage('New backupEncryptionParams required'),
    body('backupEncryptionParams.algorithm').isString().notEmpty().withMessage('backupEncryptionParams.algorithm is required'),
    body('backupEncryptionParams.iv').isString().notEmpty().withMessage('backupEncryptionParams.iv is required'),
    body('backupEncryptionParams.tagLength').isInt().withMessage('backupEncryptionParams.tagLength must be an integer')
], updateBackupPassword);

router.post('/verify-password', [
    body('passwordVerifier').isString().notEmpty().withMessage('passwordVerifier is required')
], verifyBackupPassword);

module.exports = router;