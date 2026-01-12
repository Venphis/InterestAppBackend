const express = require('express');
const { body } = require('express-validator');
const { createReport } = require('../controllers/reportController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

const ALLOWED_TYPES = ['spam', 'harassment', 'hate_speech', 'inappropriate_content', 'impersonation', 'scam', 'other'];

// --- Validation Rules ---

const reportValidation = [
    body('reportedUserId').optional().isMongoId().withMessage('Invalid User ID'),
    body('reportedMessageId').optional().isMongoId().withMessage('Invalid Message ID'),
    body('reportType').trim().notEmpty().isIn(ALLOWED_TYPES).withMessage('Invalid report type'),
    body('reason').trim().notEmpty().isLength({ min: 10, max: 1000 }).escape(),
    
    // Custom validator: Ensure at least one target exists
    body().custom((val, { req }) => {
        if (!req.body.reportedUserId && !req.body.reportedMessageId) {
            throw new Error('Provide reportedUserId or reportedMessageId');
        }
        return true;
    })
];

// --- Routes ---

router.post('/', protect, reportValidation, createReport);

module.exports = router;