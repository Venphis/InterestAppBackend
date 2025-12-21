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
  role: { 
    type: String,
    enum: ['user', 'premium_user'],
    default: 'user'
  },
  isBanned: { type: Boolean, default: false },
  banReason: { type: String, default: null },
  bannedAt: { type: Date, default: null },
  isTestAccount: { type: Boolean, default: false }, 
  isEmailVerified: { type: Boolean, default: false },
  emailVerificationToken: { type: String, select: false },
  emailVerificationTokenExpires: { type: Date, select: false },
  passwordResetToken: { type: String, select: false },
  passwordResetTokenExpires: { type: Date, select: false },
  isDeleted: {
    type: Boolean,
    default: false,
    index: true 
  },
  deletedAt: {
    type: Date,
    default: null
  },
  publicKey: { // Długożyjący klucz publiczny E2EE użytkownika (w formacie Base64)
    type: String,
    default: null,
  },
  backup: {
    type: { 
        encryptedPrivateKey: {
            type: {
                iv: { type: String, required: true },
                tag: { type: String, required: true }, // Lub tagLength, zależy od biblioteki
                ciphertext: { type: String, required: true }
            },
            default: null
        },
        encryptedBackupKey: {
            type: {
                iv: { type: String, required: true },
                tag: { type: String, required: true },
                ciphertext: { type: String, required: true }
            },
            default: null
        },
        publicKey: { type: String, default: null },
        passwordVerifier: { type: String, default: null },
        passwordDerivationParams: {
          type: {
              algorithm: { type: String, required: true }, // Np. 'argon2id13'
              salt: { type: String, required: true },      // Sól w Base64
              opsLimit: { type: Number, required: true },  // Liczba iteracji
              memLimit: { type: Number, required: true },  // Koszt pamięci w bajtach
              parallelism: { type: Number, required: true }, // Stopień równoległości
              hashLength: { type: Number, required: true }  // Długość wynikowego klucza w bajtach
          },
          default: null, // Zmień na null, bo pusty obiekt nie ma sensu bez wymaganych pól
          _id: false
              }
    },
    select: false, 
    default: {} 
  }
}, {
  timestamps: true,
});

UserSchema.pre('save', async function(next) {
  if (!this.isModified('password') || !this.password) {
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
    if (!userWithPassword || !userWithPassword.password) return false;
    return bcrypt.compare(candidatePassword, userWithPassword.password);
};

module.exports = mongoose.model('User', UserSchema);