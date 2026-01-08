const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const EncryptionParamsSchema = new mongoose.Schema({
    algorithm: { type: String, required: true },
    iv: { type: String, required: true },
    tagLength: { type: Number, required: true }
}, { _id: false });

const DerivationParamsSchema = new mongoose.Schema({
    algorithm: { type: String, required: true },
    salt: { type: String, required: true },
    opsLimit: { type: Number, required: true },
    memLimit: { type: Number, required: true },
    parallelism: { type: Number, required: true },
    hashLength: { type: Number, required: true },
    verificator: { type: String, required: true } // Key verifier
}, { _id: false });

const UserSchema = new mongoose.Schema({
  // --- Account Info ---
  username: {
    type: String,
    required: [true, 'Username required'],
    unique: true,
    trim: true,
  },
  email: {
    type: String,
    required: [true, 'Email required'],
    unique: true,
    trim: true,
    lowercase: true,
    match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Invalid email format']
  },
  password: {
    type: String,
    required: [true, 'Password required'],
    minlength: 6,
    select: false,
  },
  
  // --- Profile ---
  profile: {
    displayName: { type: String, trim: true, default: function() { return this.username; } },
    avatarUrl: { type: String, default: '' },
    gender: { type: String, enum: ['male', 'female', 'other', 'prefer_not_to_say', null], default: null },
    birthDate: { type: Date, default: null },
    location: { type: String, trim: true, default: '' },
    bio: { type: String, default: '' },
    broadcastMessage: { type: String, default: '' }
  },
  
  // --- Roles & Status ---
  role: { type: String, enum: ['user', 'premium_user'], default: 'user' },
  
  isBanned: { type: Boolean, default: false },
  banReason: { type: String, default: null },
  bannedAt: { type: Date, default: null },
  
  isTestAccount: { type: Boolean, default: false },
  
  // --- Verification & Security ---
  isEmailVerified: { type: Boolean, default: false },
  emailVerificationToken: { type: String, select: false },
  emailVerificationTokenExpires: { type: Date, select: false },
  
  passwordResetToken: { type: String, select: false },
  passwordResetTokenExpires: { type: Date, select: false },
  
  // --- Soft Delete ---
  isDeleted: { type: Boolean, default: false, index: true },
  deletedAt: { type: Date, default: null },
  
  // --- E2EE Keys ---
  publicKey: { type: String, default: null }, // Current active public key
  lastKeyRotationDate: { type: Date, default: null },

  // --- Encrypted Key Backup ---
  // Stores the user's private key encrypted with their password-derived key
  backup: {
    type: {
        publicKey: { type: String, default: null },
        encryptedPrivateKey: { type: String, default: null }, 
        encryptedBackupKey: { type: String, default: null }, 
        
        passwordDerivationParams: { type: DerivationParamsSchema, default: null },
        backupEncryptionParams: { type: EncryptionParamsSchema, default: null },
        privateEncryptionParams: { type: EncryptionParamsSchema, default: null }
    },
    select: false, // Don't return backup data unless requested
    default: {}
  }
}, { timestamps: true });

// Pre-save hook: Hash password
UserSchema.pre('save', async function(next) {
  if (!this.isModified('password') || !this.password) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

// Method: Verify password
UserSchema.methods.comparePassword = async function(candidatePassword) {
    const user = await mongoose.model('User').findById(this._id).select('+password');
    if (!user || !user.password) return false;
    return bcrypt.compare(candidatePassword, user.password);
};

module.exports = mongoose.model('User', UserSchema);