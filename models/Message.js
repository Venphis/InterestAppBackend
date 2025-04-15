// models/Message.js
const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
  chatId: { type: mongoose.Schema.Types.ObjectId, ref: 'Chat', required: true },
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  content: { type: String, required: true, trim: true },
  readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }] // Kto odczytał (opcjonalne)
}, { timestamps: true }); // timestamp wiadomości

// Indeks na chatId i timestamp dla szybkiego pobierania wiadomości w czacie
MessageSchema.index({ chatId: 1, createdAt: -1 });

module.exports = mongoose.model('Message', MessageSchema);