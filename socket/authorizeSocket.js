const jwt = require('jsonwebtoken');
const User = require('../models/User');

const authorizeSocket = async (socket, next) => {
    const token = socket.handshake.query.token;

    if (!token) {
        socket.disconnect(true);
        return;
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const user = await User.findById(decoded.id)
            .select('-__v -password -emailVerificationToken -passwordResetToken')
            .where({ isDeleted: false});

        if (!user) {
            socket.disconnect(true);
            return;
        }

        socket.user = user;
        next();

    } catch (error) {
        console.error('[SocketAuth] Failed:', error.message);
        socket.disconnect(true);
    }
};

module.exports = { authorizeSocket };
