// utils/auditLogger.js
const AuditLog = require('../models/AuditLog');

/**
 * Logs an audit event.
 * @param {string} action - Description of the action (e.g., 'user_login_success', 'admin_banned_user').
 * @param {object} actor - Information about who performed the action.
 * @param {string} actor.type - 'user', 'admin', or 'system'.
 * @param {mongoose.Types.ObjectId} actor.id - The ID of the user or admin.
 * @param {string} level - 'info', 'warn', 'error', 'critical', 'admin_action'. Default 'info'.
 * @param {object} [target] - Information about the target of the action.
 * @param {string} [target.type] - Type of the target (e.g., 'user', 'report').
 * @param {mongoose.Types.ObjectId} [target.id] - ID of the target object.
 * @param {object} [details] - Any additional details about the event.
 * @param {object} [req] - Optional Express request object to extract IP and User-Agent.
 */
const logAuditEvent = async (action, actor, level = 'info', target = {}, details = {}, req = null) => {
    try {
        const logEntry = {
            action,
            actorType: actor.type,
            actorId: actor.id,
            actorModelName: actor.type === 'admin' ? 'AdminUser' : 'User',
            level,
            targetType: target.type,
            targetId: target.id,
            details,
            ipAddress: req && req.ip ? req.ip : undefined,
            userAgent: req && req.headers ? req.headers['user-agent'] : undefined,
        };
        await AuditLog.create(logEntry);
    } catch (error) {
        console.error('Failed to log audit event:', error, { action, actor, level, target, details });
    }
};

module.exports = logAuditEvent;