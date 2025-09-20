const mongoose = require('mongoose');

const ChatSchema = new mongoose.Schema({
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }],
  lastMessage: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' }, 
  lastMessageTimestamp: { type: Date, default: Date.now }, 
}, { timestamps: true });

ChatSchema.index({ participants: 1 });

module.exports = mongoose.model('Chat', ChatSchema);