// middleware/authMiddleware.js
const jwt = require('jsonwebtoken');
const User = require('../models/User');
require('dotenv').config();

const protect = async (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // --- ZMIANA: Dodano isDeleted: false i isBanned: false ---
      req.user = await User.findById(decoded.id)
                           .select('-password -emailVerificationToken -passwordResetToken')
                           .where({ isDeleted: false, isBanned: false }); // Upewnij się, że user jest aktywny i nieusunięty

      if (!req.user) {
         // Token może być ważny, ale user nie spełnia kryteriów (usunięty, zbanowany)
         return res.status(401).json({ message: 'Not authorized, user not found, deleted, or banned' });
      }

      next(); // Przejdź do następnego middleware/kontrolera
    } catch (error) {
      console.error(error);
      res.status(401).json({ message: 'Not authorized, token failed' });
    }
  }

  if (!token) {
    res.status(401).json({ message: 'Not authorized, no token' });
  }
};

module.exports = { protect };