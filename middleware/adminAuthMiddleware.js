const jwt = require('jsonwebtoken');
const AdminUser = require('../models/AdminUser');

// Authenticates admin requests: validates JWT, token type, and account status
const protectAdmin = async (req, res, next) => {
    if (!req.headers.authorization || !req.headers.authorization.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Not authorized, no token provided' });
    }

    try {
        const token = req.headers.authorization.split(' ')[1];
        
        // Use admin secret, falling back to main secret (validated at startup)
        const secret = process.env.JWT_ADMIN_SECRET || process.env.JWT_SECRET;
        
        const decoded = jwt.verify(token, secret);

        // Security Check: Prevent regular user tokens from accessing admin routes
        if (decoded.type !== 'admin') {
            return res.status(403).json({ message: 'Access denied: Token is not an admin token' });
        }

        const admin = await AdminUser.findById(decoded.id).select('-password');

        if (!admin) {
            return res.status(401).json({ message: 'Not authorized, admin user not found' });
        }

        if (!admin.isActive) {
            return res.status(403).json({ message: 'Access denied: Admin account is inactive' });
        }

        req.adminUser = admin;
        next();

    } catch (error) {
        if (process.env.NODE_ENV !== 'test') {
            console.error('[AdminAuth] Verification failed:', error.message);
        }

        if (error instanceof jwt.TokenExpiredError) {
            return res.status(401).json({ message: 'Not authorized, token expired' });
        }
        
        return res.status(401).json({ message: 'Not authorized, invalid token' });
    }
};

// Closure middleware to restrict access based on specific admin roles
const authorizeAdminRole = (roles) => {
    return (req, res, next) => {
        // Dependency check: protectAdmin must run first
        if (!req.adminUser || !req.adminUser.role) {
            return res.status(403).json({ message: 'Access denied: User context missing' });
        }

        const allowedRoles = Array.isArray(roles) ? roles : [roles];

        if (!allowedRoles.includes(req.adminUser.role)) {
            return res.status(403).json({
                message: `Access denied. Required role: ${allowedRoles.join(' or ')}`
            });
        }
        next();
    };
};

module.exports = { protectAdmin, authorizeAdminRole };