// routes/authRoutes.js
const express = require('express');
const { body, param } = require('express-validator');
const {
    registerUser,
    loginUser,
    verifyEmail,
    resendVerificationEmail,
    forgotPassword, // Dodane
    resetPassword   // Dodane
} = require('../controllers/authController');
const router = express.Router();

router.post('/register', [
    body('username').trim().notEmpty().withMessage('Username is required').isLength({ min: 3, max: 30 }).withMessage('Username must be between 3 and 30 characters'),
    body('email').isEmail().withMessage('Please provide a valid email').normalizeEmail(),
    body('password').isLength({ min: 6, max: 100 }).withMessage('Password must be between 6 and 100 characters')
], registerUser);

router.post('/login', [
    body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
    body('password').notEmpty().withMessage('Password is required')
], loginUser);

router.get('/verify-email/:token', [
    param('token')
        .isHexadecimal().withMessage('Token must be hexadecimal')
        .isLength({ min: 64, max: 64 }).withMessage('Token must be 64 characters long') // ZMIANA DŁUGOŚCI na 64
], verifyEmail);

router.post('/resend-verification-email', [
    body('email').isEmail().withMessage('Valid email is required').normalizeEmail()
], resendVerificationEmail);

router.post('/forgot-password', [
    body('email').isEmail().withMessage('Valid email is required').normalizeEmail()
], forgotPassword);

router.put('/reset-password/:token', [
    param('token')
        .isHexadecimal().withMessage('Token must be hexadecimal')
        .isLength({ min: 64, max: 64 }).withMessage('Token must be 64 characters long'), // ZMIANA DŁUGOŚCI na 64
    body('password').isLength({ min: 6, max: 100 }).withMessage('Password must be between 6 and 100 characters')
], resetPassword);

module.exports = router;