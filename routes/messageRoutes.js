// routes/messageRoutes.js
const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const { sendMessage, allMessages } = require('../controllers/chatController'); // Kontrolery są w chatController
const router = express.Router();

// Wszystkie route'y wiadomości wymagają bycia zalogowanym
router.use(protect);

router.route('/').post(sendMessage); // POST /api/messages
router.route('/:chatId').get(allMessages); // GET /api/messages/:chatId

module.exports = router;