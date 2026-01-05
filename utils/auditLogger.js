const AuditLog = require('../models/AuditLog');

// Asynchronously creates an audit record in MongoDB for tracking system/user actions
const logAuditEvent = async (action, actor, level = 'info', target = {}, details = {}, req = null) => {
    try {
        await AuditLog.create({
            action,
            actorType: actor.type,
            actorId: actor.id,
            actorModelName: actor.type === 'admin' ? 'AdminUser' : 'User',
            level,
            targetType: target.type,
            targetId: target.id,
            details,
            ipAddress: req?.ip,
            userAgent: req?.headers?.['user-agent'],
        });
    } catch (error) {
        console.error('Audit Log Failed:', error.message);
    }
};

module.exports = logAuditEvent;