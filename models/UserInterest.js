const mongoose = require('mongoose');

const UserInterestSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  interestId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Interest',
    required: true
  },
  customDescription: { 
    type: String,
    trim: true,
    default: ''
  }
}, { timestamps: true });

// Ensure a user can only add a specific interest once
UserInterestSchema.index({ userId: 1, interestId: 1 }, { unique: true });

// Optimize lookups for user profile
UserInterestSchema.index({ userId: 1 });

module.exports = mongoose.model('UserInterest', UserInterestSchema);