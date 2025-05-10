// routes/reportRoutes.js
const express = require('express');
const { body } = require('express-validator');
const { createReport } = require('../controllers/reportController');
const { protect } = require('../middleware/authMiddleware');
const router = express.Router();

router.post('/', protect, [
    body('reportedUserId').optional().isMongoId().withMessage('Invalid reported User ID'),
    body('reportedMessageId').optional().isMongoId().withMessage('Invalid reported Message ID'),
    body('reportType').trim().notEmpty().withMessage('Report type is required').isIn(['spam', 'harassment', 'hate_speech', 'inappropriate_content', 'impersonation', 'scam', 'other']),
    body('reason').trim().notEmpty().withMessage('Reason is required').isLength({ min: 10, max: 1000 }).withMessage('Reason must be 10-1000 chars').escape(),
    body().custom((value, { req }) => {
        if (!req.body.reportedUserId && !req.body.reportedMessageId) {
            throw new Error('Either reportedUserId or reportedMessageId must be provided.');
        }
        return true;
    })
], createReport);

module.exports = router;