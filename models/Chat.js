const mongoose = require('mongoose');

const ChatSchema = new mongoose.Schema({
  participants: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  }],
  lastMessage: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Message' 
  },
  lastMessageTimestamp: { 
    type: Date, 
    default: Date.now 
  },
  // Used to mark when chat history was cleared due to key rotation
  lastResetDate: { 
    type: Date, 
    default: null 
  }
}, { timestamps: true });

// Optimize lookups for user chats
ChatSchema.index({ participants: 1 });

module.exports = mongoose.model('Chat', ChatSchema);