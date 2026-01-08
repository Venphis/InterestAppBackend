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

const ALLOWED_STATUSES = ['pending', 'accepted', 'rejected', 'blocked'];
const ALLOWED_TYPES = ['friend', 'close_friend', 'acquaintance', 'family', 'work_colleague', 'romantic_partner', 'other'];

// --- Validation Rules ---

const idValidation = [
    param('friendshipId').isMongoId().withMessage('Invalid ID format')
];

const requestValidation = [
    body('recipientId').isMongoId().withMessage('Invalid recipient ID'),
    body('friendshipType').custom(val => {
        if (val !== undefined) throw new Error('Cannot set type manually');
        return true;
    })
];

const queryValidation = [
    query('status').optional().isIn(ALLOWED_STATUSES)
];

const acceptValidation = [
    ...idValidation,
    body('friendshipType').optional().isIn(ALLOWED_TYPES)
];

// --- Routes ---

router.get('/', queryValidation, getFriendships);
router.post('/request', requestValidation, sendFriendRequest);

router.put('/:friendshipId/accept', acceptValidation, acceptFriendRequest);
router.put('/:friendshipId/reject', idValidation, rejectFriendRequest);
router.delete('/:friendshipId', idValidation, removeFriendship);

router.put('/:friendshipId/verify', idValidation, verifyFriendship);
router.put('/:friendshipId/block', idValidation, blockFriendship);
router.put('/:friendshipId/unblock', idValidation, unblockFriendship);

module.exports = router;