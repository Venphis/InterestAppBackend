const jwt = require('jsonwebtoken');
const User = require('../models/User');

const authorizeSocket = async (socket, next) => {
    const token = socket.handshake.query.token;

    if (!token) {
        return next('Authentication error: No token provided');
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const user = await User.findById(decoded.id)
            .select('-__v -password -emailVerificationToken -passwordResetToken')
            .where({ isDeleted: false, isBanned: false });

        if (!user) {
            return next('Authentication error: User not found or disabled');
        }

        socket.user = user;
        next(); 

    } catch (error) {
        console.error('[SocketAuth] Failed:', error.message);
        return next('Authentication error: Invalid token');
    }
};

module.exports = { authorizeSocket };
