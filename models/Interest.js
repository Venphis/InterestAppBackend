const mongoose = require('mongoose');
const { DEFAULT_LANG } = require('../config/i18n');

// Sub-schema for translated fields
const I18nEntrySchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
}, { _id: false });

const InterestSchema = new mongoose.Schema({
    // Base fields (default language)
    name: {
        type: String,
        required: [true, 'Interest name is required'],
        trim: true,
    },
    description: {
        type: String,
        default: '',
        trim: true,
    },
    category: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'InterestCategory',
    },
    
    // Translations map
    i18n: {
        type: Map,
        of: I18nEntrySchema,
        default: {},
    },

    isArchived: {
        type: Boolean,
        default: false,
    },
}, { timestamps: true });

// Prevent duplicate active interests in the same category
InterestSchema.index(
    { name: 1, category: 1, isArchived: 1 },
    { unique: true, partialFilterExpression: { isArchived: false } }
);

// Auto-sync base fields to i18n map for the default language
InterestSchema.pre('save', function (next) {
    if (!this.i18n) this.i18n = new Map();
    
    this.i18n.set(DEFAULT_LANG, {
        name: this.name,
        description: this.description || ''
    });
    
    next();
});

module.exports = mongoose.model('Interest', InterestSchema);