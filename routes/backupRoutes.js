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

// --- Reusable Validation Blocks ---

const paramsValidation = (prefix) => [
    body(`${prefix}`).isObject().withMessage(`${prefix} must be an object`),
    body(`${prefix}.algorithm`).isString().notEmpty().withMessage('Algorithm required'),
    body(`${prefix}.iv`).isString().notEmpty().withMessage('IV required (Base64)'),
    body(`${prefix}.tagLength`).isInt().withMessage('Tag length must be integer')
];

const derivationParamsValidation = [
    body('passwordDerivationParams').isObject(),
    body('passwordDerivationParams.algorithm').isString().notEmpty(),
    body('passwordDerivationParams.salt').isString().notEmpty(),
    body('passwordDerivationParams.opsLimit').isInt(),
    body('passwordDerivationParams.memLimit').isInt(),
    body('passwordDerivationParams.parallelism').isInt(),
    body('passwordDerivationParams.hashLength').isInt(),
    body('passwordDerivationParams.verificator').isString().notEmpty()
];

// --- Route Specific Validations ---

const saveBackupValidation = [
    body('publicKey').isString().notEmpty(),
    body('encryptedPrivateKey').isString().notEmpty(),
    body('encryptedBackupKey').isString().notEmpty(),
    
    ...derivationParamsValidation,
    ...paramsValidation('backupEncryptionParams'),
    ...paramsValidation('privateEncryptionParams')
];

const updatePasswordValidation = [
    body('encryptedBackupKey').isString().notEmpty(),
    
    ...derivationParamsValidation,
    ...paramsValidation('backupEncryptionParams')
];

const verifyPasswordValidation = [
    body('passwordVerifier').isString().notEmpty()
];

// --- Routes ---

router.post('/', saveBackupValidation, saveBackup);
router.get('/', getBackup);
router.put('/password', updatePasswordValidation, updateBackupPassword);
router.post('/verify-password', verifyPasswordValidation, verifyBackupPassword);

module.exports = router;