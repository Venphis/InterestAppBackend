const express = require('express');
const { body, param } = require('express-validator');
const {
    createAdminAccount, getAllAdminAccounts, getAdminAccountById,
    updateAdminAccount, deleteAdminAccount
} = require('../controllers/adminManagementController');
const { protectAdmin, authorizeAdminRole } = require('../middleware/adminAuthMiddleware');

const router = express.Router();

// Only Superadmins can manage other admin accounts
router.use(protectAdmin);
router.use(authorizeAdminRole('superadmin'));

const ALLOWED_ROLES = ['superadmin', 'admin', 'moderator'];

// --- Validation Rules ---

const adminIdValidation = [
    param('adminId').isMongoId().withMessage('Invalid ID format')
];

const createAdminValidation = [
    body('username').trim().notEmpty()
        .isLength({ min: 3, max: 30 })
        .matches(/^[a-zA-Z0-9_]+$/).withMessage('Alphanumeric & underscore only'),
    body('password').isLength({ min: 8, max: 100 }),
    body('role').isIn(ALLOWED_ROLES).withMessage(`Invalid role`),
    body('isActive').optional().isBoolean().toBoolean()
];

const updateAdminValidation = [
    ...adminIdValidation,
    body('role').optional().isIn(ALLOWED_ROLES),
    body('isActive').optional().isBoolean().toBoolean(),
    body().custom((val, { req }) => {
        if (req.body.role === undefined && req.body.isActive === undefined) {
            throw new Error('Provide at least role or isActive');
        }
        return true;
    })
];

// --- Routes ---

router.route('/admins')
    .post(createAdminValidation, createAdminAccount)
    .get(getAllAdminAccounts);

router.route('/admins/:adminId')
    .get(adminIdValidation, getAdminAccountById)
    .put(updateAdminValidation, updateAdminAccount)
    .delete(adminIdValidation, deleteAdminAccount);

module.exports = router;