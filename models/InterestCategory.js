// models/InterestCategory.js
const mongoose = require('mongoose');

const InterestCategorySchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Category name is required'],
        unique: true,
        trim: true
    },
    description: {
        type: String,
        default: '',
        trim: true
    }
    // Można dodać: iconUrl, order (kolejność wyświetlania)
}, { timestamps: true });

module.exports = mongoose.model('InterestCategory', InterestCategorySchema);