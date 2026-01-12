const AdminUser = require('../models/AdminUser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt'); 
const logAuditEvent = require('../utils/auditLogger'); 
const { validationResult } = require('express-validator');
require('dotenv').config();

// Helper: Generates JWT with admin-specific claims
const generateAdminToken = (id, role) => {
  return jwt.sign(
    { id, role, type: 'admin' }, 
    process.env.JWT_ADMIN_SECRET || process.env.JWT_SECRET, 
    { expiresIn: '12h' }
  );
};

// Authenticates admin and returns JWT
const loginAdmin = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { username, password } = req.body;
  
  try {
    const admin = await AdminUser.findOne({ username }).select('+password');

    if (!admin) {
      await logAuditEvent('admin_login_failed', { type: 'system' }, 'warn', {}, { username, reason: 'Not found' }, req);
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (!admin.isActive) {
      await logAuditEvent('admin_login_failed', { type: 'admin', id: admin._id }, 'warn', {}, { reason: 'Inactive account' }, req);
      return res.status(403).json({ message: 'Account is inactive' });
    }

    const isMatch = await bcrypt.compare(password, admin.password);

    if (isMatch) {
      await logAuditEvent('admin_login_success', { type: 'admin', id: admin._id }, 'info', {}, {}, req);
      
      // Return user data without password hash
      const adminData = await AdminUser.findById(admin._id);
      res.json({
        _id: adminData._id,
        username: adminData.username,
        role: adminData.role,
        token: generateAdminToken(adminData._id, adminData.role),
      });
    } else {
      await logAuditEvent('admin_login_failed', { type: 'admin', id: admin._id }, 'warn', {}, { reason: 'Invalid password' }, req);
      res.status(401).json({ message: 'Invalid credentials' });
    }
  } catch (error) {
    console.error('Admin Login Error:', error.message);
    await logAuditEvent('admin_login_error', { type: 'system' }, 'error', {}, { error: error.message }, req);
    res.status(500).json({ message: 'Server Error' });
  }
};

// Returns current authenticated admin details
const getAdminMe = async (req, res) => {
  const admin = await AdminUser.findById(req.adminUser.id);
  if (!admin) return res.status(404).json({ message: 'Admin not found' });
  
  res.json({
      _id: admin._id,
      username: admin.username,
      role: admin.role,
      isActive: admin.isActive,
      createdAt: admin.createdAt
  });
};

// Updates admin password with security checks
const changeAdminPassword = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { currentPassword, newPassword, confirmNewPassword } = req.body;
    const adminId = req.adminUser._id;

    if (newPassword !== confirmNewPassword) {
        return res.status(400).json({ message: 'Passwords do not match' });
    }
    if (newPassword === currentPassword) {
        return res.status(400).json({ message: 'New password must be different' });
    }

    try {
        const admin = await AdminUser.findById(adminId).select('+password');
        if (!admin) return res.status(404).json({ message: 'Admin not found' });

        const isMatch = await bcrypt.compare(currentPassword, admin.password);
        if (!isMatch) {
            await logAuditEvent('admin_change_password_failed', { type: 'admin', id: adminId }, 'warn', {}, { reason: 'Wrong current password' }, req);
            return res.status(401).json({ message: 'Incorrect current password' });
        }

        admin.password = newPassword;
        await admin.save(); // Triggers pre-save hook for hashing

        await logAuditEvent('admin_password_changed', { type: 'admin', id: adminId }, 'admin_action', {}, {}, req);
        res.status(200).json({ message: 'Password changed successfully' });

    } catch (error) {
        console.error('Password Change Error:', error.message);
        res.status(500).json({ message: 'Server error' });
    }
};

// Logs out admin (client must clear token)
const logoutAdmin = (req, res) => {
    logAuditEvent('admin_logout', { type: 'admin', id: req.adminUser._id }, 'info', {}, {}, req);
    res.status(200).json({ message: 'Logged out successfully' });
};

module.exports = { loginAdmin, getAdminMe, changeAdminPassword, logoutAdmin };