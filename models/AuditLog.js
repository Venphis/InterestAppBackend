// models/AuditLog.js
const mongoose = require('mongoose');

const AuditLogSchema = new mongoose.Schema({
    timestamp: { type: Date, default: Date.now },
    level: { type: String, enum: ['info', 'warn', 'error', 'critical', 'admin_action'], default: 'info' },
    actorType: { type: String, enum: ['user', 'admin', 'system'] }, // Kto wykonał akcję
    actorId: { type: mongoose.Schema.Types.ObjectId, refPath: 'actorModelName' }, // Dynamiczna referencja
    actorModelName: { type: String, enum: ['User', 'AdminUser'] }, // Model, do którego odnosi się actorId
    action: { type: String, required: true }, // Opis akcji, np. 'user_login', 'admin_banned_user'
    targetType: { type: String }, // Typ obiektu, na którym wykonano akcję, np. 'user', 'report'
    targetId: { type: mongoose.Schema.Types.ObjectId }, // ID obiektu docelowego
    details: { type: mongoose.Schema.Types.Mixed }, // Dodatkowe szczegóły, np. zmienione pola, powód bana
    ipAddress: { type: String }, // Adres IP wykonującego akcję (jeśli dostępne)
    userAgent: { type: String } // User agent przeglądarki/klienta (jeśli dostępne)
}, {
    capped: { size: 1024 * 1024 * 50, max: 50000 }, // Opcjonalnie: kolekcja ograniczona (50MB, max 50k dokumentów)
    timestamps: false // Używamy własnego pola timestamp
});

AuditLogSchema.index({ timestamp: -1 });
AuditLogSchema.index({ actorId: 1, action: 1 });
AuditLogSchema.index({ action: 1, level: 1 });

module.exports = mongoose.model('AuditLog', AuditLogSchema);