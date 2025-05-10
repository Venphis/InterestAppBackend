// routes/adminManagementRoutes.js
const express = require('express');
const { body, param } = require('express-validator');
const {
    createAdminAccount, getAllAdminAccounts, getAdminAccountById,
    updateAdminAccount, deleteAdminAccount
} = require('../controllers/adminManagementController');
const { protectAdmin, authorizeAdminRole } = require('../middleware/adminAuthMiddleware');

const router = express.Router();

router.use(protectAdmin);
router.use(authorizeAdminRole('superadmin')); // Tylko superadmin

const adminIdValidation = [param('adminId').isMongoId().withMessage('Invalid Admin Account ID format')];
const allowedAdminRoles = ['superadmin', 'admin', 'moderator'];

router.route('/admins')
    .post([
        body('username').trim().notEmpty().withMessage('Username is required')
            .isLength({ min: 3, max: 30 }).withMessage('Username must be 3-30 characters')
            .matches(/^[a-zA-Z0-9_]+$/).withMessage('Username can only contain letters, numbers, and underscores'),
        body('password').isLength({ min: 8, max: 100 }).withMessage('Password must be 8-100 characters'),
        body('role').notEmpty().withMessage('Role is required')
            .isIn(allowedAdminRoles).withMessage(`Invalid role. Allowed: ${allowedAdminRoles.join(', ')}`),
        body('isActive').optional().isBoolean().withMessage('isActive must be a boolean').toBoolean()
    ], createAdminAccount)
    .get(getAllAdminAccounts); // GET all nie wymaga walidacji body/param

router.route('/admins/:adminId')
    .get(adminIdValidation, getAdminAccountById)
    .put([
        ...adminIdValidation,
        body('role').optional().isIn(allowedAdminRoles).withMessage(`Invalid role. Allowed: ${allowedAdminRoles.join(', ')}`),
        body('isActive').optional().isBoolean().withMessage('isActive must be a boolean').toBoolean(),
        // Upewnij się, że przynajmniej jedno pole do aktualizacji jest wysłane
        body().custom((value, { req }) => {
            if (req.body.role === undefined && req.body.isActive === undefined) {
                throw new Error('At least one field (role or isActive) must be provided for update.');
            }
            return true;
        })
    ], updateAdminAccount)
    .delete(adminIdValidation, deleteAdminAccount);

module.exports = router;