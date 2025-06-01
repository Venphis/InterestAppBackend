// routes/adminAuditLogRoutes.js
const express = require('express');
const { query } = require('express-validator');
const { getAuditLogs } = require('../controllers/adminAuditLogController');
const { protectAdmin, authorizeAdminRole } = require('../middleware/adminAuthMiddleware');

const router = express.Router();

router.use(protectAdmin);
router.use(authorizeAdminRole(['superadmin', 'admin']));

const allowedLogLevels = ['info', 'warn', 'error', 'critical', 'admin_action'];
const allowedActorTypes = ['user', 'admin', 'system'];

router.get('/', [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer.').toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100.').toInt(),
    query('level').optional().isIn(allowedLogLevels).withMessage(`Invalid log level. Allowed: ${allowedLogLevels.join(', ')}.`),
    query('action').optional().isString().trim().escape().isLength({max: 100}).withMessage('Action query is too long (max 100 chars).'),
    query('actorId').optional().isMongoId().withMessage('Invalid Actor ID format.'),
    query('actorType').optional().isIn(allowedActorTypes).withMessage(`Invalid actor type. Allowed: ${allowedActorTypes.join(', ')}.`),
    query('targetId').optional().isMongoId().withMessage('Invalid Target ID format.'),
    query('targetType').optional().isString().trim().escape().isLength({max: 50}).withMessage('Target type query is too long (max 50 chars).'),
    query('startDate').optional().isISO8601().toDate().withMessage('Invalid start date format (YYYY-MM-DD or ISO8601).'),
    query('endDate').optional().isISO8601().toDate().withMessage('Invalid end date format (YYYY-MM-DD or ISO8601).')
        .custom((value, { req }) => {
            if (req.query.startDate && value && new Date(value) < new Date(req.query.startDate)) {
                throw new Error('End date cannot be before start date.'); // Ten komunikat jest z `throw new Error`
            }
            return true;
        })
], getAuditLogs);

module.exports = router;