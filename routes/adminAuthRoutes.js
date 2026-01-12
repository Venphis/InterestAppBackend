const express = require('express');
const { body } = require('express-validator');
const { loginAdmin, getAdminMe, changeAdminPassword, logoutAdmin } = require('../controllers/adminAuthController');
const { protectAdmin } = require('../middleware/adminAuthMiddleware');

const router = express.Router();

// Validation Rules
const loginValidation = [
    body('username').trim().notEmpty().withMessage('Username is required'),
    body('password').notEmpty().withMessage('Password is required')
];

const passwordChangeValidation = [
    body('currentPassword').notEmpty().withMessage('Current password is required'),
    body('newPassword').isLength({ min: 8, max: 100 }).withMessage('Password must be 8-100 chars'),
    body('confirmNewPassword').custom((value, { req }) => {
        if (value !== req.body.newPassword) throw new Error('Passwords do not match');
        return true;
    })
];

// Routes
router.post('/login', loginValidation, loginAdmin);
router.post('/logout', protectAdmin, logoutAdmin);
router.get('/me', protectAdmin, getAdminMe);
router.put('/change-password', protectAdmin, passwordChangeValidation, changeAdminPassword);

module.exports = router;