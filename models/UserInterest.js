// models/UserInterest.js
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
  customDescription: { // Własny opis użytkownika do tego zainteresowania
    type: String,
    trim: true,
    default: ''
  }
}, { timestamps: true });

// Indeks zapobiegający dodaniu tego samego zainteresowania przez tego samego użytkownika
UserInterestSchema.index({ userId: 1, interestId: 1 }, { unique: true });
// Indeks ułatwiający wyszukiwanie zainteresowań dla danego użytkownika
UserInterestSchema.index({ userId: 1 });

module.exports = mongoose.model('UserInterest', UserInterestSchema);