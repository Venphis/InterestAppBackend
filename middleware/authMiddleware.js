// middleware/authMiddleware.js
const jwt = require('jsonwebtoken');
const User = require('../models/User');
// require('dotenv').config();

const protect = async (req, res, next) => {
    if (
        !req.headers.authorization ||
        !req.headers.authorization.startsWith('Bearer ')
    ) {
        return res
            .status(401)
            .json({ message: 'Not authorized, no token or malformed header' }); // Ujednolicony komunikat
    }

    const token = req.headers.authorization.split(' ')[1];

    if (!token) {
        return res.status(401).json({ message: 'Not authorized, no token provided' });
    }

    try {
        // console.log('[AuthMiddleware] Verifying Token:', token);
        // console.log('[AuthMiddleware] JWT_SECRET FOR VERIFY:', process.env.JWT_SECRET);

        if (typeof process.env.JWT_SECRET !== 'string' || process.env.JWT_SECRET.length < 16) {
            console.error('[AuthMiddleware] JWT_SECRET is invalid or too short');
            return res.status(500).json({ message: 'Internal server error: JWT secret misconfiguration.' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        // console.log('[AuthMiddleware] DECODED TOKEN PAYLOAD:', decoded);

        // Można by tu dodać sprawdzenie `decoded.type`, jeśli tokeny użytkowników też by go miały
        // np. if (decoded.type && decoded.type === 'admin') return res.status(401).json({ message: 'Invalid token type for this route' });

        req.user = await User.findById(decoded.id)
            .select('-password -emailVerificationToken -passwordResetToken')
            .where({ isDeleted: false, isBanned: false });

        if (!req.user) {
            return res.status(401).json({ message: 'Not authorized, user not found, deleted, or banned' });
        }
        next();
    } catch (error) {
        // console.error('[AuthMiddleware] Error Verifying Token:', error.name, error.message);
        if (error instanceof jwt.JsonWebTokenError) {
            return res.status(401).json({ message: `Not authorized, token error: ${error.message}` });
        }
        return res.status(500).json({ message: 'Not authorized, server error during token processing' });
    }
};

module.exports = { protect };