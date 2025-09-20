const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const AdminUserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, 'Admin username is required'],
    unique: true,
    trim: true,
  },
  password: {
    type: String,
    required: [true, 'Admin password is required'],
    minlength: 8,
    select: false,
  },
  role: {
    type: String,
    enum: ['superadmin', 'admin', 'moderator'], 
    default: 'admin', 
  },
  isActive: { 
    type: Boolean,
    default: true,
  },
}, { timestamps: true });

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

AdminUserSchema.methods.comparePassword = async function(candidatePassword) {
  const adminWithPassword = await mongoose.model('AdminUser').findById(this._id).select('+password');
  if (!adminWithPassword) return false;
  return bcrypt.compare(candidatePassword, adminWithPassword.password);
};

module.exports = mongoose.model('AdminUser', AdminUserSchema);