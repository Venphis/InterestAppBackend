const express = require('express');
const { body, param } = require('express-validator');
const { protect } = require('../middleware/authMiddleware');
const { publishPublicKey, getPublicKey } = require('../controllers/keyController');

const router = express.Router();

router.use(protect);

// --- Validation Rules ---

const publishKeyValidation = [
    body('publicKey')
        .trim()
        .notEmpty().withMessage('Public key required')
        .isString()
];

const userIdValidation = [
    param('userId').isMongoId().withMessage('Invalid User ID')
];

// --- Routes ---

router.post('/publish', publishKeyValidation, publishPublicKey);
router.get('/:userId', userIdValidation, getPublicKey);

module.exports = router;