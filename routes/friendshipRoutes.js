// routes/friendshipRoutes.js
const express = require('express');
const { body, param, query } = require('express-validator'); // Dodano query
const { protect } = require('../middleware/authMiddleware');
const {
    sendFriendRequest,
    acceptFriendRequest,
    rejectFriendRequest,
    removeFriendship,
    getFriendships
} = require('../controllers/friendshipController');
const router = express.Router();

router.use(protect); // Wszystkie trasy chronione

const friendshipIdValidation = [param('friendshipId').isMongoId().withMessage('Invalid Friendship ID')];
const allowedFriendshipTypes = ['friend', 'close_friend', 'acquaintance', 'family', 'work_colleague', 'romantic_partner', 'other'];
const allowedFriendshipStatuses = ['pending', 'accepted', 'rejected', 'blocked'];


router.get('/', [
    query('status').optional().isIn(allowedFriendshipStatuses).withMessage(`Invalid status. Allowed: ${allowedFriendshipStatuses.join(', ')}`)
], getFriendships);

router.post('/request', [
    body('recipientId').isMongoId().withMessage('Invalid recipient ID'),
    body('friendshipType').optional().isIn(allowedFriendshipTypes).withMessage(`Invalid friendship type. Allowed: ${allowedFriendshipTypes.join(', ')}`)
], sendFriendRequest);

router.put('/:friendshipId/accept', [
    ...friendshipIdValidation,
    body('friendshipType').optional().isIn(allowedFriendshipTypes).withMessage(`Invalid friendship type. Allowed: ${allowedFriendshipTypes.join(', ')}`)
], acceptFriendRequest);

router.put('/:friendshipId/reject', friendshipIdValidation, rejectFriendRequest);
router.delete('/:friendshipId', friendshipIdValidation, removeFriendship);

module.exports = router;