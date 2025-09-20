const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
    if (
        !req.headers.authorization ||
        !req.headers.authorization.startsWith('Bearer ')
    ) {
        return res
            .status(401)
            .json({ message: 'Not authorized, no token or malformed header' });
    }

    const token = req.headers.authorization.split(' ')[1];

    if (!token) {
        return res.status(401).json({ message: 'Not authorized, no token provided' });
    }

    try {

        if (typeof process.env.JWT_SECRET !== 'string' || process.env.JWT_SECRET.length < 16) {
            console.error('[AuthMiddleware] JWT_SECRET is invalid or too short');
            return res.status(500).json({ message: 'Internal server error: JWT secret misconfiguration.' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        req.user = await User.findById(decoded.id)
            .select('-password -emailVerificationToken -passwordResetToken')
            .where({ isDeleted: false, isBanned: false });

        if (!req.user) {
            return res.status(401).json({ message: 'Not authorized, user not found, deleted, or banned' });
        }
        next();
    } catch (error) {
        if (error instanceof jwt.JsonWebTokenError) {
            return res.status(401).json({ message: `Not authorized, token error: ${error.message}` });
        }
        return res.status(500).json({ message: 'Not authorized, server error during token processing' });
    }
};

module.exports = { protect };