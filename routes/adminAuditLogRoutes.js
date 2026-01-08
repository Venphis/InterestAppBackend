const express = require('express');
const { query } = require('express-validator');
const { getAuditLogs } = require('../controllers/adminAuditLogController');
const { protectAdmin, authorizeAdminRole } = require('../middleware/adminAuthMiddleware');

const router = express.Router();

// Apply global security middleware
router.use(protectAdmin);
router.use(authorizeAdminRole(['superadmin', 'admin']));

const ALLOWED_LEVELS = ['info', 'warn', 'error', 'critical', 'admin_action'];
const ALLOWED_ACTOR_TYPES = ['user', 'admin', 'system'];

// Validation rules for filtering audit logs
const logQueryValidators = [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    
    query('level').optional().isIn(ALLOWED_LEVELS).withMessage(`Allowed levels: ${ALLOWED_LEVELS.join(', ')}`),
    query('action').optional().trim().escape().isLength({ max: 100 }),
    
    query('actorId').optional().isMongoId(),
    query('actorType').optional().isIn(ALLOWED_ACTOR_TYPES),
    
    query('targetId').optional().isMongoId(),
    query('targetType').optional().trim().escape().isLength({ max: 50 }),
    
    query('startDate').optional().isISO8601().toDate(),
    query('endDate').optional().isISO8601().toDate()
        .custom((endDate, { req }) => {
            if (req.query.startDate && endDate < new Date(req.query.startDate)) {
                throw new Error('End date cannot precede start date');
            }
            return true;
        })
];

router.get('/', logQueryValidators, getAuditLogs);

module.exports = router;