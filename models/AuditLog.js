const mongoose = require('mongoose');

const AuditLogSchema = new mongoose.Schema({
    timestamp: { 
        type: Date, 
        default: Date.now,
        index: true
    },
    level: { 
        type: String, 
        enum: ['info', 'warn', 'error', 'critical', 'admin_action'], 
        default: 'info' 
    },
    action: { 
        type: String, 
        required: true 
    },
    
    // Actor Information
    actorType: { 
        type: String, 
        enum: ['user', 'admin', 'system'] 
    },
    actorId: { 
        type: mongoose.Schema.Types.ObjectId, 
        refPath: 'actorModelName' 
    },
    actorModelName: { 
        type: String, 
        enum: ['User', 'AdminUser'] 
    },
    
    // Target Information
    targetType: { type: String },
    targetId: { type: mongoose.Schema.Types.ObjectId },
    
    // Metadata
    details: { type: mongoose.Schema.Types.Mixed },
    ipAddress: { type: String },
    userAgent: { type: String }
}, {
    // Capped Collection: Auto-overwrites old logs when size limit (50MB) or count limit (50k) is reached
    capped: { size: 50 * 1024 * 1024, max: 50000 },
    timestamps: false 
});

// Indexes for common admin panel queries
AuditLogSchema.index({ actorId: 1, action: 1 });
AuditLogSchema.index({ action: 1, level: 1 });

module.exports = mongoose.model('AuditLog', AuditLogSchema);