// models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const UserSchema = new mongoose.Schema({
  username: { // Używane do logowania, unikalne
    type: String,
    required: [true, 'Username is required'],
    unique: true,
    trim: true,
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    trim: true,
    lowercase: true,
    match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Please fill a valid email address']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: 6,
    select: false, // Domyślnie nie zwracaj hasła w zapytaniach
  },
  profile: {
    displayName: { // Nazwa wyświetlana na profilu (może być inna niż username)
      type: String,
      trim: true,
      default: function() { return this.username; } // Domyślnie username
    },
    avatarUrl: { type: String, default: '' }, // Zdjęcie profilowe (link)
    gender: {
      type: String,
      enum: ['male', 'female', 'other', 'prefer_not_to_say', null], // Płeć
      default: null
    },
    birthDate: { type: Date, default: null }, // Data urodzenia (do obliczenia wieku)
    location: { type: String, trim: true, default: '' }, // Miejscowość
    bio: { type: String, default: '' }, // Opis profilu
    broadcastMessage: { type: String, default: '' } // Wiadomość rozgłoszeniowa
  },
  // Usunięto pole: friends: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
  // Znajomości będą zarządzane przez model Friendship
  // Zainteresowania będą zarządzane przez model UserInterest
}, {
  timestamps: true, // Automatycznie dodaje createdAt i updatedAt
  // Opcja wirtualna do obliczania wieku (jeśli potrzebujesz na serwerze)
  //toJSON: { virtuals: true },
  //toObject: { virtuals: true }
});

// Wirtualne pole dla wieku (obliczane dynamicznie) - przykład
/*
UserSchema.virtual('age').get(function() {
  if (!this.profile.birthDate) {
    return null;
  }
  const today = new Date();
  const birthDate = new Date(this.profile.birthDate);
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
});
*/

// Hashowanie hasła PRZED zapisem użytkownika (bez zmian)
UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) {
    return next();
  }
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

// Metoda do porównywania hasła (bez zmian)
UserSchema.methods.comparePassword = async function(candidatePassword) {
    // Musimy pobrać hasło jawnie, bo ma select: false
    const userWithPassword = await mongoose.model('User').findById(this._id).select('+password');
    if (!userWithPassword) return false; // Na wszelki wypadek
    return bcrypt.compare(candidatePassword, userWithPassword.password);
};


module.exports = mongoose.model('User', UserSchema);