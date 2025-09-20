const express = require('express');
const { body, param, query } = require('express-validator'); 
const { protect } = require('../middleware/authMiddleware');
const {
    sendFriendRequest,
    acceptFriendRequest,
    rejectFriendRequest,
    removeFriendship,
    getFriendships,
    verifyFriendship,
    blockFriendship,   
    unblockFriendship
} = require('../controllers/friendshipController');
const router = express.Router();

router.use(protect); 

const friendshipIdValidation = [param('friendshipId').isMongoId().withMessage('Invalid Friendship ID format')];
const allowedFriendshipTypes = ['friend', 'close_friend', 'acquaintance', 'family', 'work_colleague', 'romantic_partner', 'other'];
const allowedFriendshipStatuses = ['pending', 'accepted', 'rejected', 'blocked'];


router.get('/', [
    query('status').optional().isIn(allowedFriendshipStatuses).withMessage(`Invalid status. Allowed: ${allowedFriendshipStatuses.join(', ')}`)
], getFriendships);

router.post('/request', [
    body('recipientId').isMongoId().withMessage('Invalid recipient ID'),
    body('friendshipType').custom(value => {
        if (value !== undefined) {
          throw new Error('friendshipType cannot be set manually during request creation.');
        }
        return true;
      })
], sendFriendRequest);

router.put('/:friendshipId/accept', [
    ...friendshipIdValidation,
    body('friendshipType').optional().isIn(allowedFriendshipTypes).withMessage(`Invalid friendship type. Allowed: ${allowedFriendshipTypes.join(', ')}`)
], acceptFriendRequest);

router.put('/:friendshipId/reject', friendshipIdValidation, rejectFriendRequest);
router.delete('/:friendshipId', friendshipIdValidation, removeFriendship);
router.put('/:friendshipId/verify', friendshipIdValidation, verifyFriendship);
router.put('/:friendshipId/block', protect, friendshipIdValidation /*ewentualnie body, jeśli potrzebne*/, blockFriendship); // Zakładając, że masz blockFriendship
router.put('/:friendshipId/unblock', protect, friendshipIdValidation, unblockFriendship);

module.exports = router;