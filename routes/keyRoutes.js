// routes/keyRoutes.js
const express = require('express');
const { body, param } = require('express-validator');
const { protect } = require('../middleware/authMiddleware');
const { publishPublicKey, getPublicKeys } = require('../controllers/keyController'); // Nowy kontroler
const router = express.Router();

router.use(protect); // Wszystkie trasy chronione

// Endpoint dla zalogowanego użytkownika do publikacji swojego klucza publicznego
router.post('/publish', [
    body('publicKey').isString().notEmpty().withMessage('Public key is required.')
], publishPublicKey);

// Endpoint do pobrania kluczy publicznych innych użytkowników (po ID)
router.get('/:userId', [
    param('userId').isMongoId().withMessage('Invalid User ID.')
], getPublicKeys);

module.exports = router;