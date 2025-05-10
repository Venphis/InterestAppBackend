// controllers/adminAuthController.js
const AdminUser = require('../models/AdminUser');
const jwt = require('jsonwebtoken');
require('dotenv').config();

// Funkcja pomocnicza do generowania tokenu JWT dla Admina
// Użyjemy innego sekretu lub dodamy informację o roli do payloadu, by odróżnić od tokenów użytkowników
const generateAdminToken = (id, role) => {
  return jwt.sign({ id, role, type: 'admin' }, process.env.JWT_ADMIN_SECRET || process.env.JWT_SECRET, { // Użyj osobnego JWT_ADMIN_SECRET jeśli zdefiniowany
    expiresIn: '12h', // Token admina może mieć krótszą ważność
  });
};

// @desc    Authenticate admin & get token
// @route   POST /api/admin/auth/login
// @access  Public
const loginAdmin = async (req, res) => {
  const { username, password } = req.body;

  try {
    if (!username || !password) {
      return res.status(400).json({ message: 'Please provide admin username and password' });
    }

    const admin = await AdminUser.findOne({ username });

    if (!admin) {
      return res.status(401).json({ message: 'Invalid admin credentials or admin not found' });
    }

    if (!admin.isActive) {
        return res.status(403).json({ message: 'Admin account is inactive' });
    }

    const isMatch = await admin.comparePassword(password);

    if (isMatch) {
      // Pobierz admina ponownie bez hasła (chociaż 'select: false' powinno już działać)
      const adminResponse = await AdminUser.findById(admin._id);
      res.json({
        _id: adminResponse._id,
        username: adminResponse.username,
        role: adminResponse.role,
        token: generateAdminToken(adminResponse._id, adminResponse.role),
      });
    } else {
      res.status(401).json({ message: 'Invalid admin credentials' });
    }
  } catch (error) {
    console.error('Admin Login Error:', error);
    res.status(500).json({ message: 'Server Error during admin login' });
  }
};

// @desc    Get current admin user profile (me)
// @route   GET /api/admin/auth/me
// @access  Private (Admin)
const getAdminMe = async (req, res) => {
    // req.adminUser jest ustawiane przez adminAuthMiddleware
    // Zwracamy dane admina bez hasła
    const admin = await AdminUser.findById(req.adminUser.id); // req.adminUser może nie mieć wszystkich pól
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


// TODO: Dodaj funkcje /api/admin/auth/logout (np. blacklistowanie tokenów jeśli używasz)
// TODO: Dodaj funkcję /api/admin/auth/change-password

module.exports = { loginAdmin, getAdminMe };