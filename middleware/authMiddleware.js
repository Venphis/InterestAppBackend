// middleware/authMiddleware.js
const jwt = require('jsonwebtoken');
const User = require('../models/User');
require('dotenv').config();

const protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      // Pobierz token z nagłówka (usuń 'Bearer ')
      token = req.headers.authorization.split(' ')[1];

      // Zweryfikuj token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Znajdź użytkownika na podstawie ID z tokena i dołącz go do obiektu req
      // Wyklucz hasło z wyniku
      req.user = await User.findById(decoded.id).select('-password');

      if (!req.user) {
         return res.status(401).json({ message: 'Not authorized, user not found' });
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