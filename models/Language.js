const mongoose = require('mongoose');

const LanguageSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      match: /^[a-z]{2,3}(-[a-z]{2})?$/i, // en, pl, de, en-us
      unique: true,
    },
    name: {
      type: String,
      required: true,
      trim: true, // np. "Polski", "English"
    },
    nativeName: {
      type: String,
      default: '',
      trim: true, // np. "Polski", "English"
    },
    isArchived: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Language', LanguageSchema);
