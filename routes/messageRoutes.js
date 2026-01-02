const express = require('express');
const { body, param, query } = require('express-validator');
const { protect } = require('../middleware/authMiddleware');
const { sendMessage, allMessages } = require('../controllers/chatController');
const router = express.Router();

router.use(protect);

const chatIdValidation = [param('chatId').isMongoId().withMessage('Invalid Chat ID')];


router.post('/', [
    body('chatId').isMongoId().withMessage('Chat ID is required and must be valid.'),
    body('content').isString().notEmpty().withMessage('Content must be a non-empty String.'),
], sendMessage);

router.get('/:chatId', [
    ...chatIdValidation,
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer').toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100').toInt()
], allMessages);

module.exports = router;
