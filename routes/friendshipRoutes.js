// routes/friendshipRoutes.js
const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const {
    sendFriendRequest,
    acceptFriendRequest,
    rejectFriendRequest,
    removeFriendship,
    getFriendships
} = require('../controllers/friendshipController');
const router = express.Router();

// Wszystkie route'y znajomości wymagają bycia zalogowanym
router.use(protect);

// Pobierz wszystkie znajomości (z opcjonalnym filtrem statusu)
router.get('/', getFriendships); // GET /api/friendships?status=accepted

// Wyślij zaproszenie
router.post('/request', sendFriendRequest); // POST /api/friendships/request

// Akcje na konkretnym zaproszeniu/znajomości
router.put('/:friendshipId/accept', acceptFriendRequest); // PUT /api/friendships/{id}/accept
router.put('/:friendshipId/reject', rejectFriendRequest); // PUT /api/friendships/{id}/reject
router.delete('/:friendshipId', removeFriendship);      // DELETE /api/friendships/{id} (unfriend lub cancel request)

module.exports = router;