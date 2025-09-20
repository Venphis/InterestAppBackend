const express = require('express');
const { body, param, query } = require('express-validator');
const {
    getAllUsers, getUserById, banUser, unbanUser, deleteUser, restoreUser,
    manuallyVerifyEmail, createTestUser, generateTestUserToken,changeUserRole
} = require('../controllers/adminUsersController');
const { protectAdmin, authorizeAdminRole } = require('../middleware/adminAuthMiddleware');
const router = express.Router();

router.use(protectAdmin);

router.get('/', authorizeAdminRole(['admin', 'superadmin', 'moderator']), [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('username').optional().isString().trim().escape(),
    query('email').optional().isString().trim().escape(),
    query('isBanned').optional().isBoolean().toBoolean(),
    query('isEmailVerified').optional().isBoolean().toBoolean(),
    query('isTestAccount').optional().isBoolean().toBoolean(),
    query('showDeleted').optional().isIn(['true', 'only', 'false'])
], getAllUsers);

router.post('/create-test', authorizeAdminRole(['admin', 'superadmin']), [
    body('username').trim().notEmpty().withMessage('Username is required').isLength({ min: 3, max: 30 }),
    body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
    body('password').isLength({ min: 6, max: 100 }).withMessage('Password is required and must be between 6-100 chars')
], createTestUser);

const userIdValidation = [param('userId').isMongoId().withMessage('Invalid User ID format')];

router.get('/:userId', authorizeAdminRole(['admin', 'superadmin', 'moderator']), userIdValidation, getUserById);

router.put('/:userId/ban', authorizeAdminRole(['admin', 'superadmin']), [
    ...userIdValidation,
    body('banReason').trim().notEmpty().withMessage('Ban reason is required').isLength({ max: 500 }).escape()
], banUser);

router.put('/:userId/unban', authorizeAdminRole(['admin', 'superadmin']), userIdValidation, unbanUser);
router.delete('/:userId', authorizeAdminRole(['superadmin']), userIdValidation, deleteUser);
router.put('/:userId/restore', authorizeAdminRole(['superadmin']), userIdValidation, restoreUser);
router.put('/:userId/verify-email', authorizeAdminRole(['admin', 'superadmin']), userIdValidation, manuallyVerifyEmail);
router.post('/:userId/generate-test-token', authorizeAdminRole(['admin', 'superadmin']), userIdValidation, generateTestUserToken);

router.put( 
  '/:userId/role',
  authorizeAdminRole(['superadmin']),
  [
    ...userIdValidation, 
    body('role').trim().notEmpty().withMessage('Role is required.')
  ],
  changeUserRole
);

module.exports = router;