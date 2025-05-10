// routes/adminReportRoutes.js
const express = require('express');
const { body, param, query } = require('express-validator');
const { getAllReports, getReportById, updateReport } = require('../controllers/adminReportsController');
const { protectAdmin, authorizeAdminRole } = require('../middleware/adminAuthMiddleware');
const router = express.Router();

router.use(protectAdmin);
router.use(authorizeAdminRole(['admin', 'superadmin', 'moderator']));

const reportIdValidation = [param('reportId').isMongoId().withMessage('Invalid Report ID')];

router.get('/', [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('status').optional().isIn(['pending', 'under_review', 'action_taken', 'no_action_needed', 'resolved_with_reporter']),
    query('reportType').optional().isIn(['spam', 'harassment', 'hate_speech', 'inappropriate_content', 'impersonation', 'scam', 'other'])
], getAllReports);

router.get('/:reportId', reportIdValidation, getReportById);

router.put('/:reportId', [
    ...reportIdValidation,
    body('status').optional().isIn(['pending', 'under_review', 'action_taken', 'no_action_needed', 'resolved_with_reporter']),
    body('adminNotes').optional({ checkFalsy: true }).trim().isLength({ max: 2000 }).escape(),
    body().custom((value, { req }) => {
        if (req.body.status === undefined && req.body.adminNotes === undefined) {
            throw new Error('Either status or adminNotes must be provided for update.');
        }
        return true;
    })
], updateReport);

module.exports = router;