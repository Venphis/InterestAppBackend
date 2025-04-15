// models/Interest.js
const mongoose = require('mongoose');

const InterestSchema = new mongoose.Schema({
  name: { // Nazwa zainteresowania (np. "Programowanie", "Gry planszowe")
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  category: { // Opcjonalna kategoria (np. "Technologia", "Sport", "Sztuka")
    type: String,
    trim: true
  }
  // Można dodać ikonkę, opis itp.
}, { timestamps: true });

module.exports = mongoose.model('Interest', InterestSchema);