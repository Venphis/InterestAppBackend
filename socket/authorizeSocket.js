const jwt = require('jsonwebtoken');
const User = require('../models/User');

const authorizeSocket = async (socket, next) => {
    const token = socket.handshake.query.token;

    if (!token) {
        socket.failedAuth = true   
        socket.errorMessage =  "no token"
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const user = await User.findById(decoded.id)
            .select('-__v -password -emailVerificationToken -passwordResetToken')
            .where({ isDeleted: false});

        if (!user) {
            socket.failedAuth = true   
            socket.errorMessage =  "no user found"
        } else {
            socket.user = user;
            socket.failedAuth = false;
        }

        next();

    } catch (error) {
        console.error('[SocketAuth] Error:', error.message);
        socket.failedAuth = true   
        socket.errorMessage = error.message
        next();
    }
};

module.exports = { authorizeSocket };
