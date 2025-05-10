// controllers/adminAuthController.js
const AdminUser = require('../models/AdminUser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt'); // Potrzebne do porównania starego hasła
const logAuditEvent = require('../../utils/auditLogger'); // Zakładając, że plik jest w utils
require('dotenv').config();

const generateAdminToken = (id, role) => {
  return jwt.sign({ id, role, type: 'admin' }, process.env.JWT_ADMIN_SECRET || process.env.JWT_SECRET, {
    expiresIn: '12h',
  });
};

const loginAdmin = async (req, res) => {
  const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
  const { username, password } = req.body;
  let adminForLog = null; // Do logowania przy nieudanym logowaniu
  try {
    if (!username || !password) {
      return res.status(400).json({ message: 'Please provide admin username and password' });
    }
    const admin = await AdminUser.findOne({ username }).select('+password'); // Potrzebujemy hasła do porównania
    adminForLog = admin; // Zapisz admina do logów, nawet jeśli logowanie się nie uda

    if (!admin) {
      await logAuditEvent('admin_login_failed', { type: 'system' }, 'warn', {}, { attemptUsername: username, reason: 'Admin not found' }, req);
      return res.status(401).json({ message: 'Invalid admin credentials or admin not found' });
    }
    if (!admin.isActive) {
      await logAuditEvent('admin_login_failed', { type: 'admin', id: admin._id }, 'warn', {}, { reason: 'Account inactive' }, req);
      return res.status(403).json({ message: 'Admin account is inactive' });
    }

    const isMatch = await bcrypt.compare(password, admin.password); // Bezpośrednie porównanie, bo mamy już hasło

    if (isMatch) {
      const adminResponse = await AdminUser.findById(admin._id); // Pobierz bez hasła do odpowiedzi
      await logAuditEvent('admin_login_success', { type: 'admin', id: adminResponse._id }, 'info', {}, {}, req);
      res.json({
        _id: adminResponse._id,
        username: adminResponse.username,
        role: adminResponse.role,
        token: generateAdminToken(adminResponse._id, adminResponse.role),
      });
    } else {
      await logAuditEvent('admin_login_failed', { type: 'admin', id: admin._id }, 'warn', {}, { reason: 'Invalid password' }, req);
      res.status(401).json({ message: 'Invalid admin credentials' });
    }
  } catch (error) {
    console.error('Admin Login Error:', error);
    await logAuditEvent('admin_login_error', { type: 'system' }, 'error', {}, { error: error.message, attemptUsername: username, adminId: adminForLog ? adminForLog._id : null }, req);
    res.status(500).json({ message: 'Server Error during admin login' });
  }
};

const getAdminMe = async (req, res) => {
  const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const admin = await AdminUser.findById(req.adminUser.id);
    if (!admin) {
        return res.status(404).json({ message: 'Admin not found' });
    }
    res.json({
        _id: admin._id,
        username: admin.username,
        role: admin.role,
        isActive: admin.isActive,
        createdAt: admin.createdAt
    });
};

// @desc    Change current admin's password
// @route   PUT /api/admin/auth/change-password
// @access  Private (Admin)
const changeAdminPassword = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
  }

    const { currentPassword, newPassword, confirmNewPassword } = req.body;
    const adminId = req.adminUser._id; // Z protectAdmin middleware

    if (!currentPassword || !newPassword || !confirmNewPassword) {
        return res.status(400).json({ message: 'Please provide current password, new password, and confirm new password.' });
    }
    if (newPassword !== confirmNewPassword) {
        return res.status(400).json({ message: 'New password and confirmation password do not match.' });
    }
    if (newPassword.length < 8) {
        return res.status(400).json({ message: 'New password must be at least 8 characters long.' });
    }
    if (newPassword === currentPassword) {
        return res.status(400).json({ message: 'New password cannot be the same as the current password.' });
    }

    try {
        // Musimy pobrać admina z jego hasłem, aby porównać currentPassword
        const admin = await AdminUser.findById(adminId).select('+password');
        if (!admin) {
            // To nie powinno się zdarzyć, jeśli protectAdmin działa poprawnie
            await logAuditEvent('admin_change_password_failed', { type: 'admin', id: adminId }, 'error', {}, { reason: 'Admin not found during password change' }, req);
            return res.status(404).json({ message: 'Admin not found.' });
        }

        const isMatch = await bcrypt.compare(currentPassword, admin.password);
        if (!isMatch) {
            await logAuditEvent('admin_change_password_failed', { type: 'admin', id: adminId }, 'warn', {}, { reason: 'Incorrect current password' }, req);
            return res.status(401).json({ message: 'Incorrect current password.' });
        }

        // Ustaw nowe hasło (hook pre-save w AdminUser.js je zahashuje)
        admin.password = newPassword;
        await admin.save();

        await logAuditEvent('admin_password_changed', { type: 'admin', id: adminId }, 'admin_action', {}, {}, req);

        // TODO: Rozważ unieważnienie wszystkich innych tokenów JWT dla tego admina
        // (wymaga blacklistowania tokenów lub mechanizmu sesji)

        res.status(200).json({ message: 'Password changed successfully.' });

    } catch (error) {
        console.error('Admin Change Password Error:', error);
        await logAuditEvent('admin_change_password_error', { type: 'admin', id: adminId }, 'error', {}, { error: error.message }, req);
        res.status(500).json({ message: 'Server error changing password.' });
    }
};


const logoutAdmin = (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    // W przypadku JWT, serwer nie musi nic specjalnego robić.
    // Klient powinien usunąć token.
    // Jeśli implementujesz blacklistowanie, tutaj dodaj token do blacklisty.
    logAuditEvent('admin_logout', { type: 'admin', id: req.adminUser._id }, 'info', {}, {}, req);
    res.status(200).json({ message: 'Admin logged out successfully. Please clear your token.' });
};

module.exports = { loginAdmin, getAdminMe, changeAdminPassword, logoutAdmin };