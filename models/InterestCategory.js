const mongoose = require('mongoose');
const { DEFAULT_LANG } = require('../config/i18n');

const I18nEntrySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '', trim: true },
}, { _id: false });

const InterestCategorySchema = new mongoose.Schema({
  // Base fields (default language)
  name: {
    type: String,
    required: [true, 'Category name is required'],
    unique: true,
    trim: true,
  },
  description: {
    type: String,
    default: '',
    trim: true,
  },

  // Translations map
  i18n: {
    type: Map,
    of: I18nEntrySchema,
    default: {},
  },
}, { timestamps: true });

// Auto-sync base fields to the i18n map for DEFAULT_LANG
InterestCategorySchema.pre('save', function (next) {
  if (!this.i18n) this.i18n = new Map();
  
  this.i18n.set(DEFAULT_LANG, {
    name: this.name,
    description: this.description || ''
  });
  
  next();
});

module.exports = mongoose.model('InterestCategory', InterestCategorySchema);