// routes/messageRoutes.js
const express = require('express');
const { body, param } = require('express-validator');
const { protect } = require('../middleware/authMiddleware');
const { sendMessage, allMessages } = require('../controllers/chatController'); // Kontrolery są w chatController
const router = express.Router();

router.use(protect);

const chatIdValidation = [param('chatId').isMongoId().withMessage('Invalid Chat ID')];

router.post('/', [
    body('chatId').isMongoId().withMessage('Chat ID is required and must be valid.'),
    body('content').trim().notEmpty().withMessage('Message content cannot be empty.').isLength({ max: 5000 }).withMessage('Message content max 5000 chars.').escape()
], sendMessage);

router.get('/:chatId', chatIdValidation, allMessages);

module.exports = router;