const express = require('express');
const { body, param, query } = require('express-validator');
const {
    getAllUsers, getUserById, banUser, unbanUser, deleteUser, restoreUser,
    manuallyVerifyEmail, createTestUser, generateTestUserToken, changeUserRole, getUserInterestsAdmin
} = require('../controllers/adminUsersController');
const { protectAdmin, authorizeAdminRole } = require('../middleware/adminAuthMiddleware');

const router = express.Router();
router.use(protectAdmin);

// --- Validation Rules ---

const userIdValidation = [param('userId').isMongoId().withMessage('Invalid User ID')];

const userQueryValidation = [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('username').optional().trim().escape(),
    query('email').optional().trim().escape(),
    query('isBanned').optional().isBoolean().toBoolean(),
    query('showDeleted').optional().isIn(['true', 'only', 'false'])
];

const createTestUserValidation = [
    body('username').trim().notEmpty().isLength({ min: 3, max: 30 }),
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6, max: 100 })
];

const banValidation = [
    ...userIdValidation,
    body('banReason').trim().notEmpty().isLength({ max: 500 }).escape()
];

const roleChangeValidation = [
    ...userIdValidation,
    body('role').trim().notEmpty()
];

// --- Routes ---

router.get('/', authorizeAdminRole(['admin', 'superadmin', 'moderator']), userQueryValidation, getAllUsers);

router.post('/create-test', authorizeAdminRole(['admin', 'superadmin']), createTestUserValidation, createTestUser);

router.route('/:userId')
    .get(authorizeAdminRole(['admin', 'superadmin', 'moderator']), userIdValidation, getUserById)
    .delete(authorizeAdminRole(['superadmin']), userIdValidation, deleteUser);

// User Actions
router.put('/:userId/ban', authorizeAdminRole(['admin', 'superadmin', 'moderator']), banValidation, banUser);
router.put('/:userId/unban', authorizeAdminRole(['admin', 'superadmin', 'moderator']), userIdValidation, unbanUser);
router.put('/:userId/restore', authorizeAdminRole(['admin','superadmin']), userIdValidation, restoreUser);
router.put('/:userId/verify-email', authorizeAdminRole(['admin', 'superadmin']), userIdValidation, manuallyVerifyEmail);
router.put('/:userId/role', authorizeAdminRole(['superadmin']), roleChangeValidation, changeUserRole);

// Sub-resources
router.post('/:userId/generate-test-token', authorizeAdminRole(['admin', 'superadmin']), userIdValidation, generateTestUserToken);
router.get('/:userId/interests', authorizeAdminRole(['admin', 'superadmin', 'moderator']), userIdValidation, getUserInterestsAdmin);

module.exports = router;