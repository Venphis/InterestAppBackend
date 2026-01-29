const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Authenticates standard user requests: verifies JWT and checks account status
// android app looks for: Not Authorized in the message
const protect = async (req, res, next) => {
    if (!req.headers.authorization || !req.headers.authorization.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Not authorized, no token provided' });
    }

    try {
        const token = req.headers.authorization.split(' ')[1];

        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Fetch user, excluding sensitive data and ensuring account is active (not banned/deleted)
        req.user = await User.findById(decoded.id)
            .select('-password -emailVerificationToken -passwordResetToken')
            .where({ isDeleted: false, isBanned: false });

        if (!req.user) {
            return res.status(401).json({ message: 'Not authorized, user not found or disabled' });
        }

        next();

    } catch (error) {
        if (process.env.NODE_ENV !== 'test') {
            console.error('[AuthMiddleware] Verification failed:', error.message);
        }

        if (error instanceof jwt.TokenExpiredError) {
            return res.status(401).json({ message: 'Not authorized, token expired' });
        }

        return res.status(401).json({ message: 'Not authorized, invalid token' });
    }
};

module.exports = { protect };
