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
  isArchived: { 
    type: Boolean,
    default: false
  }
}, { timestamps: true });

InterestSchema.index({ name: 1, category: 1, isArchived: 1 }, {
    unique: true,
    partialFilterExpression: { isArchived: false } 
});

module.exports = mongoose.model('Interest', InterestSchema);