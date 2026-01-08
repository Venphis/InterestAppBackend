const express = require('express');
const { body, param, query } = require('express-validator');
const { protect } = require('../middleware/authMiddleware');
const { sendMessage, allMessages } = require('../controllers/chatController');

const router = express.Router();

router.use(protect);

// --- Validation Rules ---

const chatIdValidation = [
    param('chatId').isMongoId().withMessage('Invalid Chat ID')
];

const messageValidation = [
    body('chatId').isMongoId().withMessage('Invalid Chat ID'),
    body('content').isString().notEmpty().withMessage('Content required')
];

const paginationValidation = [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt()
];

// --- Routes ---

router.post('/', messageValidation, sendMessage);

router.get('/:chatId', 
    [...chatIdValidation, ...paginationValidation], 
    allMessages
);

module.exports = router;