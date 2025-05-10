// models/Interest.js
const mongoose = require('mongoose');

const InterestSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Interest name is required'],
    trim: true
  },
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'InterestCategory',
  },
  description: {
      type: String,
      default: '',
      trim: true
  },
  isArchived: { // NOWE POLE
    type: Boolean,
    default: false
  }
}, { timestamps: true });

// Unikalny indeks dla kombinacji nazwa + kategoria, ale tylko jeśli nie jest zarchiwizowane
// Jeśli chcesz, aby zarchiwizowane zainteresowania mogły mieć te same nazwy co aktywne.
// Lub prostszy indeks, jeśli nazwa ma być globalnie unikalna.
InterestSchema.index({ name: 1, category: 1, isArchived: 1 }, {
    unique: true,
    partialFilterExpression: { isArchived: false } // Unikalność tylko dla aktywnych
});
// Jeśli nazwa globalnie unikalna dla aktywnych:
// InterestSchema.index({ name: 1 }, { unique: true, partialFilterExpression: { isArchived: false } });


module.exports = mongoose.model('Interest', InterestSchema);