// routes/authRoutes.js
const express = require('express');
const {
    registerUser,
    loginUser,
    verifyEmail,
    resendVerificationEmail,
    forgotPassword, // Dodane
    resetPassword   // Dodane
} = require('../controllers/authController');
const router = express.Router();

router.post('/register', registerUser);
router.post('/login', loginUser);
router.get('/verify-email/:token', verifyEmail);
router.post('/resend-verification-email', resendVerificationEmail);

// Nowe trasy dla resetu hasła
router.post('/forgot-password', forgotPassword);
router.put('/reset-password/:token', resetPassword); // PUT, bo aktualizujemy zasób (hasło użytkownika)

module.exports = router;