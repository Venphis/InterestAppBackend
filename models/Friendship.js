// models/Friendship.js
const mongoose = require('mongoose');

const FriendshipSchema = new mongoose.Schema({
  user1: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  user2: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'rejected', 'blocked'],
    default: 'pending',
    required: true
  },
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  friendshipType: {
    type: String,
    enum: ['unverified', 'verified'],
    default: 'unverified',
    required: true
  },
  blockedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  isBlocked: {
    type: Boolean,
    default: false,
  }
}, { timestamps: true });

// POPRAWKA O3 (pkt 4a) - Hook do sortowania ID przed walidacją/zapisem
FriendshipSchema.pre('validate', function (next) {
  if (this.user1 && this.user2 && this.user1.toString() > this.user2.toString()) {
    [this.user1, this.user2] = [this.user2, this.user1];
  }
  next();
});

// ── Unikalny duet user1 + user2 ─────────────────────────────────
FriendshipSchema.index({ user1: 1, user2: 1 }, { unique: true });

FriendshipSchema.index({ user1: 1, status: 1, isBlocked: 1 });
FriendshipSchema.index({ user2: 1, status: 1, isBlocked: 1 });

// Usunięto poprzedni hook pre('save') dotyczący isBlocked, logika przeniesiona do kontrolerów

module.exports = mongoose.model('Friendship', FriendshipSchema);