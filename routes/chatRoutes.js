const express = require('express');
const { body } = require('express-validator'); 
const { protect } = require('../middleware/authMiddleware');
const { accessChat, fetchChats } = require('../controllers/chatController');
const router = express.Router();

router.use(protect);

router.route('/')
    .post([
        body('userId').isMongoId().withMessage('Valid recipient User ID is required for chat.')
    ], accessChat)
    .get(fetchChats); 

module.exports = router;