// routes/adminAuditLogRoutes.js
const express = require('express');
const { query } = require('express-validator'); // Tylko query params
const { getAuditLogs } = require('../controllers/adminAuditLogController');
const { protectAdmin, authorizeAdminRole } = require('../middleware/adminAuthMiddleware');

const router = express.Router();

router.use(protectAdmin);
// Dostęp do logów może być ograniczony do superadmina lub adminów z określonymi uprawnieniami
router.use(authorizeAdminRole(['superadmin', 'admin']));

router.get('/', [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer').toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100').toInt(),
    query('level').optional().isIn(['info', 'warn', 'error', 'critical', 'admin_action']).withMessage('Invalid log level'),
    query('action').optional().isString().trim().escape().isLength({max: 100}).withMessage('Action query too long'),
    query('actorId').optional().isMongoId().withMessage('Invalid Actor ID format'),
    query('actorType').optional().isIn(['user', 'admin', 'system']).withMessage('Invalid actor type'),
    query('targetId').optional().isMongoId().withMessage('Invalid Target ID format'),
    query('targetType').optional().isString().trim().escape().isLength({max: 50}).withMessage('Target type query too long'),
    query('startDate').optional().isISO8601().toDate().withMessage('Invalid start date format (YYYY-MM-DD)'),
    query('endDate').optional().isISO8601().toDate().withMessage('Invalid end date format (YYYY-MM-DD)')
        .custom((value, { req }) => { // Niestandardowa walidacja: endDate nie może być przed startDate
            if (req.query.startDate && value && new Date(value) < new Date(req.query.startDate)) {
                throw new Error('End date cannot be before start date');
            }
            return true;
        })
], getAuditLogs);

module.exports = router;