// routes/adminReportRoutes.js
const express = require('express');
const { body, param, query } = require('express-validator');
const { getAllReports, getReportById, updateReport } = require('../controllers/adminReportsController');
const { protectAdmin, authorizeAdminRole } = require('../middleware/adminAuthMiddleware');
const router = express.Router();

router.use(protectAdmin);
router.use(authorizeAdminRole(['admin', 'superadmin', 'moderator']));

const reportIdValidation = [param('reportId').isMongoId().withMessage('Invalid Report ID')];
const allowedReportStatuses = ['pending', 'under_review', 'action_taken', 'no_action_needed', 'resolved_with_reporter'];
const allowedReportTypesQuery = ['spam', 'harassment', 'hate_speech', 'inappropriate_content', 'impersonation', 'scam', 'other'];


router.get('/', [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer.').toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100.').toInt(),
    query('status').optional().isIn(allowedReportStatuses).withMessage(`Invalid status value`),
    query('reportType').optional().isIn(allowedReportTypesQuery).withMessage(`Invalid report type. Allowed: ${allowedReportTypesQuery.join(', ')}.`)
], getAllReports);

router.get('/:reportId', reportIdValidation, getReportById);

router.put('/:reportId', [
    ...reportIdValidation,
    body('status').optional().isIn(allowedReportStatuses).withMessage(`Invalid status value`),
    body('adminNotes').optional({ checkFalsy: true }).trim().isLength({ max: 2000 }).withMessage('Admin notes cannot exceed 2000 characters.').escape(),
    body().custom((value, { req }) => {
        if (req.body.status === undefined && req.body.adminNotes === undefined) {
            // Ten komunikat jest z throw new Error
            throw new Error('Either status or adminNotes must be provided for update.');
        }
        return true;
    })
], updateReport);

module.exports = router;