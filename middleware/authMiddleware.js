// middleware/authMiddleware.js
const jwt = require('jsonwebtoken'); // <-- DODAJ TEN IMPORT
const User = require('../models/User');
// require('dotenv').config(); // Możesz to usunąć, jeśli dotenv jest ładowany globalnie

const protect = async (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];

      if (typeof token !== 'string' || token.split('.').length !== 3) {
          return res.status(401).json({ message: 'Not authorized, token is malformed (structure)' });
      }
      if (typeof process.env.JWT_SECRET !== 'string' || process.env.JWT_SECRET.length < 16) {
          return res.status(500).json({ message: 'Internal server error: JWT secret misconfiguration.' });
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      try { // Dodaj blok try-catch wokół operacji na bazie
          req.user = await User.findById(decoded.id)
                                .select('-password -emailVerificationToken -passwordResetToken')
                                .where({ isDeleted: false, isBanned: false });
      } catch (dbError) {
          console.error('[AuthMiddleware] DATABASE ERROR during User.findById:', dbError);
          // Rzuć błąd dalej lub obsłuż specyficznie, aby testy pokazały problem z bazą
          return next(dbError); // Przekaż błąd do globalnego error handlera Express
      }


      if (!req.user) {
        return res.status(401).json({ message: 'Not authorized, user not found, deleted, or banned' });
      }
      next();
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) { // Sprawdź, czy jwt jest zdefiniowane przed użyciem JsonWebTokenError
        return res.status(401).json({ message: `Not authorized, token error: ${error.message}` });
      }
      return res.status(500).json({ message: 'Not authorized, server error during token processing' });
    }
  }

  if (!token) {
    return res.status(401).json({ message: 'Not authorized, no token' });
  }
};

module.exports = { protect };