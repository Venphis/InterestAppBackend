// models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const UserSchema = new mongoose.Schema({
  username: {
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
    select: false,
  },
  profile: {
    displayName: {
      type: String,
      trim: true,
      default: function() { return this.username; }
    },
    avatarUrl: { type: String, default: '' },
    gender: {
      type: String,
      enum: ['male', 'female', 'other', 'prefer_not_to_say', null],
      default: null
    },
    birthDate: { type: Date, default: null },
    location: { type: String, trim: true, default: '' },
    bio: { type: String, default: '' },
    broadcastMessage: { type: String, default: '' }
  },
  role: { // Rola zwykłego użytkownika (np. 'user', 'premium_user')
    type: String,
    enum: ['user', 'premium_user'],
    default: 'user'
  },
  isBanned: { type: Boolean, default: false },
  banReason: { type: String, default: null },
  bannedAt: { type: Date, default: null },
  isTestAccount: { type: Boolean, default: false }, // Czy to konto testowe
  isEmailVerified: { type: Boolean, default: false },
  emailVerificationToken: { type: String, select: false },
  emailVerificationTokenExpires: { type: Date, select: false },
  passwordResetToken: { type: String, select: false },
  passwordResetTokenExpires: { type: Date, select: false },
}, {
  timestamps: true,
});

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

UserSchema.methods.comparePassword = async function(candidatePassword) {
  const userWithPassword = await mongoose.model('User').findById(this._id).select('+password');
  if (!userWithPassword) return false;
  return bcrypt.compare(candidatePassword, userWithPassword.password);
};

module.exports = mongoose.model('User', UserSchema);