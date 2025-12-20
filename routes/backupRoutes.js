// routes/backupRoutes.js
const express = require('express');
const { body } = require('express-validator');
const { protect } = require('../middleware/authMiddleware');
const { saveBackup, getBackup } = require('../controllers/backupController');
const router = express.Router();

router.use(protect);

router.post('/', [
    body('encryptedPrivateKey').isBase64().withMessage('encryptedPrivateKey must be a Base64 string.'),
    body('encryptedBackupKey').isBase64().withMessage('encryptedBackupKey must be a Base64 string.'),
    body('passwordDerivationParams').isObject().withMessage('passwordDerivationParams must be an object.'),
    body('passwordDerivationParams.algorithm').isString().notEmpty().withMessage('Algorithm is required.'),
    body('passwordDerivationParams.salt').isBase64().withMessage('Salt must be a Base64 string.'),
    body('passwordDerivationParams.opsLimit').isInt().withMessage('opsLimit must be an integer.'),
    body('passwordDerivationParams.memLimit').isInt().withMessage('memLimit must be an integer.')
], saveBackup);

router.get('/', getBackup);

module.exports = router;