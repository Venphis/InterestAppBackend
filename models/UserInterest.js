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

UserInterestSchema.index({ userId: 1, interestId: 1 }, { unique: true });
UserInterestSchema.index({ userId: 1 });

module.exports = mongoose.model('UserInterest', UserInterestSchema);