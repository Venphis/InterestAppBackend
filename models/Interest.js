const mongoose = require('mongoose');
const { DEFAULT_LANG } = require('../config/i18n');

const I18nEntrySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
  },
  { _id: false }
);

const InterestSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Interest name is required'],
      trim: true,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'InterestCategory',
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },

    i18n: {
      type: Map,
      of: I18nEntrySchema,
      default: {},
    },

    isArchived: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

InterestSchema.index(
  { name: 1, category: 1, isArchived: 1 },
  { unique: true, partialFilterExpression: { isArchived: false } }
);

InterestSchema.pre('save', function (next) {
  try {
    if (!this.i18n) this.i18n = new Map();
    const current = this.i18n.get(DEFAULT_LANG) || {};
    current.name = this.name;
    current.description = this.description ?? '';
    this.i18n.set(DEFAULT_LANG, current);
    next();
  } catch (e) {
    next(e);
  }
});

module.exports = mongoose.model('Interest', InterestSchema);
