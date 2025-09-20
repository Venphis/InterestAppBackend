const mongoose = require('mongoose');

const AuditLogSchema = new mongoose.Schema({
    timestamp: { type: Date, default: Date.now },
    level: { type: String, enum: ['info', 'warn', 'error', 'critical', 'admin_action'], default: 'info' },
    actorType: { type: String, enum: ['user', 'admin', 'system'] },
    actorId: { type: mongoose.Schema.Types.ObjectId, refPath: 'actorModelName' },
    actorModelName: { type: String, enum: ['User', 'AdminUser'] },
    action: { type: String, required: true },
    targetType: { type: String },
    targetId: { type: mongoose.Schema.Types.ObjectId },
    details: { type: mongoose.Schema.Types.Mixed },
    ipAddress: { type: String }, 
    userAgent: { type: String }
}, {
    capped: { size: 1024 * 1024 * 50, max: 50000 },
    timestamps: false 
});

AuditLogSchema.index({ timestamp: -1 });
AuditLogSchema.index({ actorId: 1, action: 1 });
AuditLogSchema.index({ action: 1, level: 1 });

module.exports = mongoose.model('AuditLog', AuditLogSchema);