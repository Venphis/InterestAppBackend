// models/AdminUser.js
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const AdminUserSchema = new mongoose.Schema({
  username: { // Nazwa użytkownika admina, unikalna
    type: String,
    required: [true, 'Admin username is required'],
    unique: true,
    trim: true,
  },
  password: {
    type: String,
    required: [true, 'Admin password is required'],
    minlength: 8, // Można ustawić mocniejsze wymagania dla adminów
    select: false, // Domyślnie nie zwracaj hasła w zapytaniach
  },
  role: {
    type: String,
    enum: ['superadmin', 'admin', 'moderator'], // Role specyficzne dla panelu
    default: 'admin', // Domyślna rola przy tworzeniu (można zmienić)
  },
  isActive: { // Czy konto admina jest aktywne
    type: Boolean,
    default: true,
  },
  // Można dodać: lastLoginAt, createdBy (ID innego admina) itp.
}, { timestamps: true });

// Hashowanie hasła PRZED zapisem admina
AdminUserSchema.pre('save', async function(next) {
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

// Metoda do porównywania hasła (używana przy logowaniu admina)
AdminUserSchema.methods.comparePassword = async function(candidatePassword) {
  const adminWithPassword = await mongoose.model('AdminUser').findById(this._id).select('+password');
  if (!adminWithPassword) return false;
  return bcrypt.compare(candidatePassword, adminWithPassword.password);
};

module.exports = mongoose.model('AdminUser', AdminUserSchema);