const express = require('express');
const { body, param } = require('express-validator');
const {
    registerUser,
    loginUser,
    verifyEmail,
    resendVerificationEmail,
    forgotPassword, 
    resetPassword 
} = require('../controllers/authController');

const router = express.Router();

// --- Validation Rules ---

const registerValidation = [
    body('username').trim().notEmpty().isLength({ min: 3, max: 30 }).withMessage('Username: 3-30 chars'),
    body('email').isEmail().normalizeEmail().withMessage('Invalid email'),
    body('password').isLength({ min: 6, max: 100 }).withMessage('Password: 6-100 chars')
];

const loginValidation = [
    body('email').isEmail().normalizeEmail().withMessage('Invalid email'),
    body('password').notEmpty().withMessage('Password required')
];

const emailValidation = [
    body('email').isEmail().normalizeEmail().withMessage('Invalid email')
];

const tokenValidation = [
    param('token').isHexadecimal().isLength({ min: 64, max: 64 }).withMessage('Invalid token format')
];

const resetPasswordValidation = [
    ...tokenValidation,
    body('password').isLength({ min: 6, max: 100 }).withMessage('Password: 6-100 chars')
];

// --- Routes ---

router.post('/register', registerValidation, registerUser);
router.post('/login', loginValidation, loginUser);

router.get('/verify-email/:token', tokenValidation, verifyEmail);
router.post('/resend-verification-email', emailValidation, resendVerificationEmail);

router.post('/forgot-password', emailValidation, forgotPassword);
router.put('/reset-password/:token', resetPasswordValidation, resetPassword);

module.exports = router;