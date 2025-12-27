const mongoose = require('mongoose');
const { DEFAULT_LANG } = require('../config/i18n');

const I18nEntrySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
  },
  { _id: false }
);

const InterestCategorySchema = new mongoose.Schema(
  {
    // bazowa nazwa (u Ciebie: PL)
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

    // tłumaczenia: i18n["en"] = { name, description }
    i18n: {
      type: Map,
      of: I18nEntrySchema,
      default: {},
    },
  },
  { timestamps: true }
);

// utrzymuj spójność: bazowe pola (pl) zawsze kopiują się do i18n[pl]
InterestCategorySchema.pre('save', function (next) {
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

module.exports = mongoose.model('InterestCategory', InterestCategorySchema);
