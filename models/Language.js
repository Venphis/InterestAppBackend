const mongoose = require('mongoose');

const LanguageSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    match: /^[a-z]{2,3}(-[a-z]{2})?$/i, // ISO format
  },
  name: {
    type: String, // English name
    required: true,
    trim: true,
  },
  nativeName: {
    type: String, // Native name
    default: '',
    trim: true,
  },
  isArchived: {
    type: Boolean,
    default: false,
  },
}, { timestamps: true });

module.exports = mongoose.model('Language', LanguageSchema);