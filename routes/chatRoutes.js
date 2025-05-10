// routes/chatRoutes.js
const express = require('express');
const { body } = require('express-validator'); // Nie ma tu param ani query na razie
const { protect } = require('../middleware/authMiddleware');
const { accessChat, fetchChats } = require('../controllers/chatController');
const router = express.Router();

router.use(protect);

router.route('/')
    .post([
        body('userId').isMongoId().withMessage('Valid recipient User ID is required for chat.')
    ], accessChat)
    .get(fetchChats); // GET nie wymaga walidacji body/param na razie

module.exports = router;