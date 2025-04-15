// controllers/authController.js
const User = require('../models/User');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });
};

const registerUser = async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
      return res.status(400).json({ message: 'Please provide username, email, and password' });
  }
   if (password.length < 6) {
       return res.status(400).json({ message: 'Password must be at least 6 characters long' });
   }

  try {
    const userExists = await User.findOne({ $or: [{ email }, { username }] });
    if (userExists) {
      return res.status(400).json({ message: 'User with this email or username already exists' });
    }

    // Hasło jest hashowane przez pre-save hook w modelu
    const user = await User.create({
      username,
      email,
      password,
      // Profile.displayName domyślnie przyjmie username
    });

    // Zwracamy użytkownika bez hasła (domyślnie nie jest wybierane)
    const userResponse = await User.findById(user._id);

    res.status(201).json({
        _id: userResponse._id,
        username: userResponse.username,
        email: userResponse.email,
        profile: userResponse.profile, // Zwróć podstawowy profil
        token: generateToken(userResponse._id),
      });

  } catch (error) {
    console.error('Registration Error:', error);
    // Lepsze raportowanie błędów walidacji Mongoose
    if (error.name === 'ValidationError') {
        const messages = Object.values(error.errors).map(val => val.message);
        return res.status(400).json({ message: messages.join(', ') });
    }
    res.status(500).json({ message: 'Server Error during registration' });
  }
};

const loginUser = async (req, res) => {
  const { email, password } = req.body;

  try {
    if (!email || !password) {
       return res.status(400).json({ message: 'Please provide email and password' });
    }

    // Znajdź użytkownika po emailu (hasło nie jest pobierane domyślnie)
    const user = await User.findOne({ email });

    if (!user) {
         return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Użyj zmodyfikowanej metody comparePassword z modelu
    const isMatch = await user.comparePassword(password);

    if (isMatch) {
      // Pobierz użytkownika ponownie bez hasła do odpowiedzi
      const userResponse = await User.findById(user._id);
      res.json({
        _id: userResponse._id,
        username: userResponse.username,
        email: userResponse.email,
        profile: userResponse.profile,
        token: generateToken(userResponse._id),
      });
    } else {
      res.status(401).json({ message: 'Invalid email or password' });
    }
  } catch (error) {
    console.error('Login Error:', error);
    res.status(500).json({ message: 'Server Error during login' });
  }
};

module.exports = { registerUser, loginUser };