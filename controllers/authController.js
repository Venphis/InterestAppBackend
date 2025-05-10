// controllers/authController.js
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const sendEmail = require('../utils/sendEmail');
require('dotenv').config();

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });
};

const createAndHashToken = () => {
    const token = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto
        .createHash('sha256')
        .update(token)
        .digest('hex');
    return { token, hashedToken };
};

// registerUser - bez zmian (już zaimplementowany)
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
      emailVerificationToken,
      emailVerificationTokenExpires,
    });

    const verificationURL = `${req.protocol}://${req.get('host')}/api/auth/verify-email/${verificationToken}`;
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
    });

    res.status(201).json({
        message: 'User registered successfully. Please check your email to activate your account.',
      });

  } catch (error) {
    console.error('Registration Error:', error);
    if (error.name === 'ValidationError') {
        const messages = Object.values(error.errors).map(val => val.message);
        return res.status(400).json({ message: messages.join(', ') });
    }
    if (email && !res.headersSent) {
        const userToDelete = await User.findOne({email});
        if(userToDelete && !userToDelete.isEmailVerified) await User.deleteOne({email});
    }
    res.status(500).json({ message: 'Server Error during registration. Please try again.' });
  }
};


// verifyEmail - bez zmian (już zaimplementowany)
const verifyEmail = async (req, res) => {
    try {
        const token = req.params.token;
        const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

        const user = await User.findOne({
            emailVerificationToken: hashedToken,
            emailVerificationTokenExpires: { $gt: Date.now() }
        });

        if (!user) {
            return res.status(400).json({ message: 'Invalid or expired verification token. Please request a new one.' });
        }

        user.isEmailVerified = true;
        user.emailVerificationToken = undefined;
        user.emailVerificationTokenExpires = undefined;
        await user.save({ validateBeforeSave: false });

        res.status(200).json({ message: 'Email verified successfully. You can now log in.' });

    } catch (error) {
        console.error('Email Verification Error:', error);
        res.status(500).json({ message: 'Server error during email verification.' });
    }
};

// resendVerificationEmail - bez zmian (już zaimplementowany)
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
        user.emailVerificationTokenExpires = Date.now() + 10 * 60 * 1000;
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


// loginUser - bez zmian (już zaimplementowany)
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
    if (!user.isEmailVerified) {
        return res.status(403).json({
            message: 'Please verify your email address before logging in. You can request a new verification link.',
            emailNotVerified: true
        });
    }
    if (user.isBanned) {
        return res.status(403).json({
            message: `Your account has been banned. Reason: ${user.banReason || 'Not specified'}. Please contact support.`,
            accountBanned: true
        });
    }
    const isMatch = await user.comparePassword(password);
    if (isMatch) {
      const userResponse = await User.findById(user._id);
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


// --- NOWE FUNKCJE DLA RESETU HASŁA ---

// @desc    Forgot password - send reset token
// @route   POST /api/auth/forgot-password
// @access  Public
const forgotPassword = async (req, res) => {
    const { email } = req.body;
    if (!email) {
        return res.status(400).json({ message: 'Please provide an email address.' });
    }

    try {
        const user = await User.findOne({ email });
        if (!user) {
            // Nie informuj bezpośrednio, że użytkownik nie istnieje (ze względów bezpieczeństwa)
            return res.status(200).json({ message: 'If an account with that email exists, a password reset link has been sent.' });
        }

        const { token: resetToken, hashedToken: passwordResetToken } = createAndHashToken();
        user.passwordResetToken = passwordResetToken;
        user.passwordResetTokenExpires = Date.now() + 10 * 60 * 1000; // Token ważny 10 minut
        await user.save({ validateBeforeSave: false });

        // URL do resetowania hasła na frontendzie (frontend obsłuży formularz zmiany hasła)
        // lub bezpośredni link do API, który potem przekieruje
        const resetURL = `${process.env.FRONTEND_URL || req.protocol + '://' + req.get('host')}/reset-password?token=${resetToken}`;
        // Dla testów API można użyć: `${req.protocol}://${req.get('host')}/api/auth/reset-password/${resetToken}`

        const message = `
            Witaj ${user.username},\n\n
            Otrzymaliśmy prośbę o zresetowanie hasła dla Twojego konta. Jeśli to Ty, kliknij w poniższy link (ważny przez 10 minut):\n
            ${resetURL}\n\n
            Jeśli to nie Ty prosiłeś o zmianę hasła, zignoruj tę wiadomość. Twoje hasło pozostanie niezmienione.\n\n
            Pozdrawiamy,\nZespół Social App
        `;

        await sendEmail({
            email: user.email,
            subject: 'Reset Hasła w Social App',
            message,
        });

        res.status(200).json({ message: 'If an account with that email exists, a password reset link has been sent.' });

    } catch (error) {
        console.error('Forgot Password Error:', error);
        // W przypadku błędu, nie informuj o szczegółach, ale zaloguj
         // Aby uniknąć wycieku informacji, nawet przy błędzie serwera można zwrócić ogólny komunikat
        res.status(200).json({ message: 'If an account with that email exists and an error occurred, we are looking into it. Please try again later.' });
        // LUB dla developmentu: res.status(500).json({ message: 'Server error processing forgot password request.' });
    }
};

// @desc    Reset password using token
// @route   PUT /api/auth/reset-password/:token
// @access  Public
const resetPassword = async (req, res) => {
    const { password } = req.body;
    const token = req.params.token;

    if (!password || password.length < 6) {
        return res.status(400).json({ message: 'Password must be at least 6 characters long.' });
    }

    try {
        const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

        const user = await User.findOne({
            passwordResetToken: hashedToken,
            passwordResetTokenExpires: { $gt: Date.now() }
        }).select('+password'); // Musimy wybrać hasło, aby je zmodyfikować i zapisać

        if (!user) {
            return res.status(400).json({ message: 'Invalid or expired password reset token. Please request a new one.' });
        }

        // Ustaw nowe hasło (hook pre-save w User.js je zahashuje)
        user.password = password;
        user.passwordResetToken = undefined;
        user.passwordResetTokenExpires = undefined;
        // Dodatkowo, jeśli użytkownik resetuje hasło, można uznać jego email za zweryfikowany, jeśli jeszcze nie był
        // if (!user.isEmailVerified) user.isEmailVerified = true;
        await user.save();

        // TODO: Rozważ unieważnienie wszystkich istniejących sesji/tokenów JWT dla tego użytkownika

        // Można automatycznie zalogować użytkownika i zwrócić nowy token JWT
        // const jwtToken = generateToken(user._id);
        // res.status(200).json({ message: 'Password reset successfully. You are now logged in.', token: jwtToken, user: { _id: user._id, username: user.username, email: user.email } });

        res.status(200).json({ message: 'Password reset successfully. You can now log in with your new password.' });

    } catch (error) {
        console.error('Reset Password Error:', error);
        res.status(500).json({ message: 'Server error resetting password.' });
    }
};


module.exports = {
    registerUser,
    loginUser,
    verifyEmail,
    resendVerificationEmail,
    forgotPassword, // Dodane
    resetPassword   // Dodane
};