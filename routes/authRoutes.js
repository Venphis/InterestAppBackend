// routes/authRoutes.js
const express = require('express');
const {
    registerUser,
    loginUser,
    verifyEmail,
    resendVerificationEmail
} = require('../controllers/authController');
const router = express.Router();

router.post('/register', registerUser);
router.post('/login', loginUser);
router.get('/verify-email/:token', verifyEmail); // :token to parametr URL
router.post('/resend-verification-email', resendVerificationEmail);

// TODO: Dodaj trasy dla /forgot-password i /reset-password/:token

module.exports = router;