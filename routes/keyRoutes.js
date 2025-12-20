// routes/keyRoutes.js
const express = require('express');
const { body, param } = require('express-validator');
const { protect } = require('../middleware/authMiddleware');
const { publishPublicKey, getPublicKey } = require('../controllers/keyController');
const router = express.Router();

router.use(protect);

router.post('/publish', [
    body('publicKey')
        .trim()
        .notEmpty().withMessage('Public key is required.')
        .isString().withMessage('Public key must be a string.')
], publishPublicKey);

router.get('/:userId', [
    param('userId').isMongoId().withMessage('Invalid User ID format.')
], getPublicKey);

module.exports = router;