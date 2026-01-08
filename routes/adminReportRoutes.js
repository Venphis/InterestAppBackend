const express = require('express');
const { body, param, query } = require('express-validator');
const { getAllReports, getReportById, updateReport } = require('../controllers/adminReportsController');
const { protectAdmin, authorizeAdminRole } = require('../middleware/adminAuthMiddleware');

const router = express.Router();

router.use(protectAdmin);
router.use(authorizeAdminRole(['admin', 'superadmin', 'moderator']));

const ALLOWED_STATUSES = ['pending', 'under_review', 'action_taken', 'no_action_needed', 'resolved_with_reporter'];
const ALLOWED_TYPES = ['spam', 'harassment', 'hate_speech', 'inappropriate_content', 'impersonation', 'scam', 'other'];

// --- Validation Rules ---

const reportIdValidation = [
    param('reportId').isMongoId().withMessage('Invalid Report ID')
];

const reportQueryValidation = [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('status').optional().isIn(ALLOWED_STATUSES),
    query('reportType').optional().isIn(ALLOWED_TYPES)
];

const reportUpdateValidation = [
    ...reportIdValidation,
    body('status').optional().isIn(ALLOWED_STATUSES).withMessage('Invalid status'),
    body('adminNotes').optional({ checkFalsy: true }).trim().isLength({ max: 2000 }).escape(),
    body().custom((val, { req }) => {
        if (!req.body.status && req.body.adminNotes === undefined) {
            throw new Error('Provide at least status or adminNotes');
        }
        return true;
    })
];

// --- Routes ---

router.get('/', reportQueryValidation, getAllReports);
router.get('/:reportId', reportIdValidation, getReportById);
router.put('/:reportId', reportUpdateValidation, updateReport);

module.exports = router;