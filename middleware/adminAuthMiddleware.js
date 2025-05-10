// middleware/adminAuthMiddleware.js
const jwt = require('jsonwebtoken');
const AdminUser = require('../models/AdminUser'); // Użyj modelu AdminUser
require('dotenv').config();

// Middleware do ochrony tras tylko dla zalogowanych adminów
const protectAdmin = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      token = req.headers.authorization.split(' ')[1];

      // Weryfikuj token używając JWT_ADMIN_SECRET jeśli jest, inaczej JWT_SECRET
      // Ważne: upewnij się, że payload tokena admina zawiera np. 'type: admin' lub inną identyfikację
      const decoded = jwt.verify(token, process.env.JWT_ADMIN_SECRET || process.env.JWT_SECRET);

      // Sprawdź, czy token jest typu 'admin' (jeśli dodałeś 'type' przy generowaniu)
      if (decoded.type !== 'admin') {
          return res.status(401).json({ message: 'Not authorized, token is not an admin token' });
      }

      // req.adminUser będzie zawierać dane z tokena (id, role)
      // Można pobrać pełny obiekt admina z bazy, jeśli potrzebne od razu
      const admin = await AdminUser.findById(decoded.id).select('-password');
      if (!admin || !admin.isActive) {
        return res.status(401).json({ message: 'Not authorized, admin not found or inactive' });
      }
      req.adminUser = admin; // Dołącz pełny obiekt admina (bez hasła) do requestu

      next();
    } catch (error) {
      console.error('Admin Auth Error:', error.message);
      if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
        return res.status(401).json({ message: 'Not authorized, token failed or expired' });
      }
      res.status(401).json({ message: 'Not authorized, token processing error' });
    }
  }

  if (!token) {
    res.status(401).json({ message: 'Not authorized, no token' });
  }
};

// Middleware do sprawdzania konkretnej roli admina (np. 'superadmin')
const authorizeAdminRole = (roles) => { // roles może być stringiem lub tablicą stringów
  return (req, res, next) => {
    if (!req.adminUser || !req.adminUser.role) {
        return res.status(403).json({ message: 'Not authorized, admin role not found in request' });
    }
    const allowedRoles = Array.isArray(roles) ? roles : [roles];
    if (!allowedRoles.includes(req.adminUser.role)) {
      return res.status(403).json({
        message: `Admin role '${req.adminUser.role}' is not authorized to access this route. Required: ${allowedRoles.join(' or ')}.`
      });
    }
    next();
  };
};


module.exports = { protectAdmin, authorizeAdminRole };