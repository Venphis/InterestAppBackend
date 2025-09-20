const express = require('express');
const { body } = require('express-validator');
const { loginAdmin, getAdminMe, changeAdminPassword, logoutAdmin } = require('../controllers/adminAuthController');
const { protectAdmin } = require('../middleware/adminAuthMiddleware');
const router = express.Router();

router.post('/login', [
    body('username').trim().notEmpty().withMessage('Admin username is required'),
    body('password').notEmpty().withMessage('Admin password is required')
], loginAdmin);

router.get('/me', protectAdmin, getAdminMe);

router.put('/change-password', protectAdmin, [
    body('currentPassword').notEmpty().withMessage('Current password is required'),
    body('newPassword').isLength({ min: 8, max: 100 }).withMessage('New password must be between 8 and 100 characters'),
    body('confirmNewPassword').custom((value, { req }) => {
        if (value !== req.body.newPassword) {
            throw new Error('New password confirmation does not match new password');
        }
        return true;
    })
], changeAdminPassword);

router.post('/logout', protectAdmin, logoutAdmin);

module.exports = router;