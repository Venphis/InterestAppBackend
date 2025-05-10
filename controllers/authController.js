// controllers/authController.js
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const crypto = require('crypto'); // Do generowania tokenów
const sendEmail = require('../utils/sendEmail'); // Import funkcji do wysyłania emaili
require('dotenv').config();

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });
};

// Helper do generowania i hashowania tokenów (dla weryfikacji emaila i resetu hasła)
const createAndHashToken = () => {
    const token = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto
        .createHash('sha256')
        .update(token)
        .digest('hex');
    return { token, hashedToken };
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

    const { token: verificationToken, hashedToken: emailVerificationToken } = createAndHashToken();
    const emailVerificationTokenExpires = Date.now() + 10 * 60 * 1000; // Token ważny 10 minut

    const user = await User.create({
      username,
      email,
      password,
      emailVerificationToken, // Zapisz zahashowany token
      emailVerificationTokenExpires,
    });

    // Wyślij email weryfikacyjny
    // Adres URL do weryfikacji będzie zależał od tego, gdzie użytkownik ma być przekierowany
    // Może to być endpoint API, który potem przekieruje, lub bezpośredni link do strony frontendu
    const verificationURL = `${req.protocol}://${req.get('host')}/api/auth/verify-email/${verificationToken}`; // Token niehashowany w URL!
    // Lub jeśli masz frontend: `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`

    const message = `
        Witaj ${user.username},\n\n
        Dziękujemy za rejestrację! Aby aktywować swoje konto, kliknij w poniższy link (ważny przez 10 minut):\n
        ${verificationURL}\n\n
        Jeśli to nie Ty zakładałeś konto, zignoruj tę wiadomość.\n\n
        Pozdrawiamy,\nZespół Social App
    `;

    await sendEmail({
        email: user.email,
        subject: 'Aktywacja Konta w Social App',
        message,
        // htmlMessage: '<h1>Witaj!</h1><p>...</p>' // Możesz dodać wersję HTML
    });

    res.status(201).json({
        message: 'User registered successfully. Please check your email to activate your account.',
        // Nie zwracaj tokenu JWT od razu, dopiero po weryfikacji emaila i logowaniu
        // user: { _id: user._id, username: user.username, email: user.email } // Można zwrócić podstawowe info
      });

  } catch (error) {
    console.error('Registration Error:', error);
    if (error.name === 'ValidationError') {
        const messages = Object.values(error.errors).map(val => val.message);
        return res.status(400).json({ message: messages.join(', ') });
    }
    // Usuń użytkownika jeśli email nie został wysłany, aby mógł spróbować ponownie
    if (email && !res.headersSent) { // Sprawdź czy nie wysłano już odpowiedzi
        const userToDelete = await User.findOne({email});
        if(userToDelete && !userToDelete.isEmailVerified) await User.deleteOne({email});
    }
    res.status(500).json({ message: 'Server Error during registration. Please try again.' });
  }
};

// @desc    Verify email address
// @route   GET /api/auth/verify-email/:token
// @access  Public
const verifyEmail = async (req, res) => {
    try {
        const token = req.params.token;
        const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

        const user = await User.findOne({
            emailVerificationToken: hashedToken,
            emailVerificationTokenExpires: { $gt: Date.now() } // Sprawdź czy token nie wygasł
        });

        if (!user) {
            // Możesz przekierować do strony błędu na frontendzie
            // return res.redirect(`${process.env.FRONTEND_URL}/email-verification-failed?message=Invalid or expired token`);
            return res.status(400).json({ message: 'Invalid or expired verification token. Please request a new one.' });
        }

        user.isEmailVerified = true;
        user.emailVerificationToken = undefined; // Usuń token po użyciu
        user.emailVerificationTokenExpires = undefined;
        await user.save({ validateBeforeSave: false }); // Zapisz bez walidacji, bo np. hasło może nie być modyfikowane

        // Możesz przekierować do strony sukcesu na frontendzie
        // return res.redirect(`${process.env.FRONTEND_URL}/email-verified?message=Email verified successfully. You can now log in.`);
        res.status(200).json({ message: 'Email verified successfully. You can now log in.' });

    } catch (error) {
        console.error('Email Verification Error:', error);
        // return res.redirect(`${process.env.FRONTEND_URL}/email-verification-failed?message=Server error`);
        res.status(500).json({ message: 'Server error during email verification.' });
    }
};

// @desc    Resend email verification token
// @route   POST /api/auth/resend-verification-email
// @access  Public
const resendVerificationEmail = async (req, res) => {
    const { email } = req.body;
    if (!email) {
        return res.status(400).json({ message: 'Please provide an email address.' });
    }

    try {
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ message: 'User with this email not found.' });
        }
        if (user.isEmailVerified) {
            return res.status(400).json({ message: 'This email is already verified.' });
        }

        const { token: verificationToken, hashedToken: emailVerificationToken } = createAndHashToken();
        user.emailVerificationToken = emailVerificationToken;
        user.emailVerificationTokenExpires = Date.now() + 10 * 60 * 1000; // Nowy token ważny 10 minut
        await user.save({ validateBeforeSave: false });

        const verificationURL = `${req.protocol}://${req.get('host')}/api/auth/verify-email/${verificationToken}`;
        const message = `Witaj ${user.username},\n\nKliknij w poniższy link, aby dokończyć aktywację konta (ważny przez 10 minut):\n${verificationURL}\n\nPozdrawiamy,\nZespół Social App`;

        await sendEmail({
            email: user.email,
            subject: 'Ponowna Aktywacja Konta w Social App',
            message,
        });

        res.status(200).json({ message: 'Verification email resent. Please check your inbox.' });

    } catch (error) {
        console.error('Resend Verification Email Error:', error);
        res.status(500).json({ message: 'Server error resending verification email.' });
    }
};


const loginUser = async (req, res) => {
  const { email, password } = req.body;

  try {
    if (!email || !password) {
       return res.status(400).json({ message: 'Please provide email and password' });
    }

    const user = await User.findOne({ email });

    if (!user) {
         return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Dodatkowe sprawdzenie: Czy email jest zweryfikowany?
    if (!user.isEmailVerified) {
        return res.status(403).json({
            message: 'Please verify your email address before logging in. You can request a new verification link.',
            emailNotVerified: true // Flaga dla frontendu
        });
    }
    // Dodatkowe sprawdzenie: Czy konto jest zbanowane?
    if (user.isBanned) {
        return res.status(403).json({
            message: `Your account has been banned. Reason: ${user.banReason || 'Not specified'}. Please contact support.`,
            accountBanned: true // Flaga dla frontendu
        });
    }


    const isMatch = await user.comparePassword(password);

    if (isMatch) {
      const userResponse = await User.findById(user._id); // Pobierz bez hasła
      res.json({
        _id: userResponse._id,
        username: userResponse.username,
        email: userResponse.email,
        profile: userResponse.profile,
        role: userResponse.role,
        isTestAccount: userResponse.isTestAccount,
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

// TODO: Implement forgotPassword and resetPassword functions

module.exports = { registerUser, loginUser, verifyEmail, resendVerificationEmail };