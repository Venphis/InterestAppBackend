// models/Chat.js
const mongoose = require('mongoose');

const ChatSchema = new mongoose.Schema({
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }],
  lastMessage: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' }, // Opcjonalnie, dla szybkiego podglądu
  lastMessageTimestamp: { type: Date, default: Date.now }, // Do sortowania czatów
}, { timestamps: true });

// Indeks na uczestnikach dla szybszego wyszukiwania czatów użytkownika
ChatSchema.index({ participants: 1 });

module.exports = mongoose.model('Chat', ChatSchema);