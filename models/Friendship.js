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
    enum: ['unverified', 'verified'], // 'verified' means verified via NFC/QR
    default: 'unverified'
  },
  // Blocking logic
  isBlocked: { type: Boolean, default: false },
  blockedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

// Ensure deterministic order of user IDs to prevent duplicate relationships (A-B vs B-A)
FriendshipSchema.pre('validate', function (next) {
  if (this.user1 && this.user2 && this.user1.toString() > this.user2.toString()) {
    const temp = this.user1;
    this.user1 = this.user2;
    this.user2 = temp;
  }
  next();
});

// Composite index to enforce unique friendship between two users
FriendshipSchema.index({ user1: 1, user2: 1 }, { unique: true });

// Indexes for querying lists (friends, requests)
FriendshipSchema.index({ user1: 1, status: 1, isBlocked: 1 });
FriendshipSchema.index({ user2: 1, status: 1, isBlocked: 1 });

module.exports = mongoose.model('Friendship', FriendshipSchema);