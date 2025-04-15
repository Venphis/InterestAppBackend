// routes/chatRoutes.js
const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const { accessChat, fetchChats } = require('../controllers/chatController');
const router = express.Router();

// Wszystkie route'y czatu wymagają bycia zalogowanym
router.use(protect);

router.route('/').post(accessChat).get(fetchChats); // POST /api/chats , GET /api/chats

// Route'y dla wiadomości będą w osobnym pliku
// router.route('/:chatId/messages').get(allMessages); // Przeniesione do messageRoutes

module.exports = router;