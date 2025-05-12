// middleware/adminAuthMiddleware.js
const jwt = require('jsonwebtoken');
const AdminUser = require('../models/AdminUser');
// require('dotenv').config(); // Niepotrzebne, jeśli NODE_OPTIONS działa

const protectAdmin = async (req, res, next) => {
    // 1. Sprawdź, czy nagłówek Authorization istnieje i ma poprawny format
    if (
        !req.headers.authorization ||
        !req.headers.authorization.startsWith('Bearer ') // Ważna spacja po 'Bearer '
    ) {
        // console.log('[AdminAuthMiddleware] No/Invalid Authorization Header'); // Log dla debugowania
        return res
            .status(401)
            .json({ message: 'Not authorized, no admin token or malformed header' }); // Ujednolicony komunikat
    }

    const token = req.headers.authorization.split(' ')[1];

    // Jeśli token jest pusty po split (np. tylko "Bearer ")
    if (!token) {
        // console.log('[AdminAuthMiddleware] Empty token after split'); // Log dla debugowania
        return res.status(401).json({ message: 'Not authorized, no admin token provided' });
    }

    try {
        // console.log('[AdminAuthMiddleware] Verifying Token:', token);
        const secretToUse = process.env.JWT_ADMIN_SECRET || process.env.JWT_SECRET;
        // console.log('[AdminAuthMiddleware] Secret used for verification:', secretToUse);

        if (typeof secretToUse !== 'string' || secretToUse.length < 16) {
            console.error('[AdminAuthMiddleware] JWT_ADMIN_SECRET is invalid or too short:', secretToUse);
            return res.status(500).json({ message: 'Internal server error: JWT admin secret misconfiguration.' });
        }

        const decoded = jwt.verify(token, secretToUse);
        // console.log('[AdminAuthMiddleware] DECODED ADMIN TOKEN PAYLOAD:', decoded);

        if (decoded.type !== 'admin') {
            // console.warn('[AdminAuthMiddleware] Token is not of type "admin". Decoded type:', decoded.type);
            // Zgodnie z sugestią O3 i Twoją asercją
            return res.status(401).json({ message: 'token is not an admin token' });
        }

        const admin = await AdminUser.findById(decoded.id).select('-password');
        if (!admin || !admin.isActive) {
            // console.warn(`[AdminAuthMiddleware] Admin user ${decoded.id} not found or inactive.`);
            return res.status(401).json({ message: 'Not authorized, admin not found or inactive' });
        }
        req.adminUser = admin;
        next();
    } catch (error) {
        // console.error('[AdminAuthMiddleware] Error Verifying Admin Token:', error.name, error.message);
        if (error instanceof jwt.JsonWebTokenError) {
            return res.status(401).json({ message: `Not authorized, admin token error: ${error.message}` });
        }
        // Inne nieoczekiwane błędy
        return res.status(500).json({ message: 'Not authorized, server error during admin token processing' });
    }
};

const authorizeAdminRole = (roles) => {
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