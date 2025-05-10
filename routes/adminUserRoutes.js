// routes/adminUserRoutes.js
const express = require('express');
const {
    getAllUsers,
    getUserById,
    banUser,
    unbanUser,
    deleteUser,
    manuallyVerifyEmail,
    createTestUser,
    generateTestUserToken
} = require('../controllers/adminUsersController');
const { protectAdmin, authorizeAdminRole } = require('../middleware/adminAuthMiddleware');

const router = express.Router();

// Wszystkie trasy poniżej są chronione i wymagają bycia zalogowanym adminem
router.use(protectAdmin);

router.get('/', authorizeAdminRole(['admin', 'superadmin', 'moderator']), getAllUsers); // Moderator może tylko przeglądać
router.post('/create-test', authorizeAdminRole(['admin', 'superadmin']), createTestUser);

router.get('/:userId', authorizeAdminRole(['admin', 'superadmin', 'moderator']), getUserById);
router.put('/:userId/ban', authorizeAdminRole(['admin', 'superadmin']), banUser);
router.put('/:userId/unban', authorizeAdminRole(['admin', 'superadmin']), unbanUser);
router.delete('/:userId', authorizeAdminRole(['superadmin']), deleteUser); // Tylko superadmin może usuwać
router.put('/:userId/verify-email', authorizeAdminRole(['admin', 'superadmin']), manuallyVerifyEmail);
router.post('/:userId/generate-test-token', authorizeAdminRole(['admin', 'superadmin']), generateTestUserToken);


module.exports = router;