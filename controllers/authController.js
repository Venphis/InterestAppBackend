// controllers/authController.js
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const sendEmail = require('../utils/sendEmail');
const logAuditEvent = require('../utils/auditLogger');
const { validationResult } = require('express-validator');
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

const registerUser = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { username, email, password } = req.body;

    try {
        const userExists = await User.findOne({ $or: [{ email }, { username }] });
        if (userExists) {
            if (userExists.isDeleted) {
                await logAuditEvent('user_registration_attempt_deleted_account', { type: 'system' }, 'warn', {}, { email, username }, req);
                return res.status(400).json({ message: 'An account with this email or username previously existed and was deleted. Please contact support or use different credentials.' });
            }
            await logAuditEvent('user_registration_attempt_existing_account', { type: 'system' }, 'warn', {}, { email, username }, req);
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

        await logAuditEvent('user_registered', { type: 'user', id: user._id }, 'info', {}, { email: user.email }, req);
        res.status(201).json({
            message: 'User registered successfully. Please check your email to activate your account.',
        });

    } catch (error) {
        console.error('Registration Error:', error);
        await logAuditEvent('user_registration_error', {type: 'system'}, 'error', {}, {error: error.message, attemptEmail: email, attemptUsername: username}, req);

        if (error.name === 'ValidationError') { // Błąd z Mongoose
            const messages = Object.values(error.errors).map(val => val.message);
            return res.status(400).json({ message: messages.join(', ') });
        }
        // Nie usuwamy użytkownika w przypadku błędu, aby uniknąć race conditions lub utraty danych
        res.status(500).json({ message: 'Server Error during registration. Please try again.' });
    }
};

const verifyEmail = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const token = req.params.token;
        const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

        const user = await User.findOne({
            emailVerificationToken: hashedToken,
            emailVerificationTokenExpires: { $gt: Date.now() }
        });

        if (!user) {
            await logAuditEvent('user_email_verify_failed', { type: 'system' }, 'warn', {}, { reason: 'Invalid or expired token', tokenAttempt: token }, req);
            return res.status(400).json({ message: 'Invalid or expired verification token. Please request a new one.' });
        }

        user.isEmailVerified = true;
        user.emailVerificationToken = undefined;
        user.emailVerificationTokenExpires = undefined;

        if (user.isDeleted) {
            user.isDeleted = false;
            user.deletedAt = null;
            await logAuditEvent('user_account_restored_on_email_verify', { type: 'user', id: user._id }, 'info', {}, {}, req);
        }

        await user.save({ validateBeforeSave: false });
        await logAuditEvent('user_email_verified', { type: 'user', id: user._id }, 'info', {}, {}, req);
        res.status(200).json({ message: 'Email verified successfully. You can now log in.' });

    } catch (error) {
        console.error('Email Verification Error:', error);
        await logAuditEvent('user_email_verify_error', { type: 'system' }, 'error', {}, { error: error.message, tokenAttempt: req.params.token }, req);
        res.status(500).json({ message: 'Server error during email verification.' });
    }
};

const resendVerificationEmail = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    const { email } = req.body;

    try {
        const user = await User.findOne({ email });
        if (!user) {
            await logAuditEvent('user_resend_verification_not_found', { type: 'system' }, 'warn', {}, { attemptEmail: email }, req);
            return res.status(404).json({ message: 'User with this email not found.' });
        }
        if (user.isEmailVerified) {
            return res.status(400).json({ message: 'This email is already verified.' });
        }
        if (user.isBanned) {
            await logAuditEvent('user_resend_verification_banned_account', { type: 'user', id: user._id }, 'warn', {}, {}, req);
            return res.status(403).json({ message: 'This account is banned and cannot request a new verification email.' });
        }
         if (user.isDeleted) {
            await logAuditEvent('user_resend_verification_deleted_account', { type: 'user', id: user._id }, 'warn', {}, {}, req);
            return res.status(403).json({ message: 'This account has been deleted. Please contact support.' });
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

        await logAuditEvent('user_resent_verification_email', { type: 'user', id: user._id }, 'info', {}, {}, req);
        res.status(200).json({ message: 'Verification email resent. Please check your inbox.' });

    } catch (error) {
        console.error('Resend Verification Email Error:', error);
        await logAuditEvent('user_resend_verification_error', {type: 'system'}, 'error', {}, {error: error.message, attemptEmail: email}, req);
        res.status(500).json({ message: 'Server error resending verification email.' });
    }
};

const loginUser = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    const { email, password } = req.body;

    try {
        const user = await User.findOne({ email, isDeleted: false });

        if (!user) {
            await logAuditEvent('user_login_failed', { type: 'system' }, 'warn', {}, { attemptEmail: email, reason: 'User not found or deleted' }, req);
            return res.status(401).json({ message: 'Invalid email or password' });
        }
        if (!user.isEmailVerified) {
            await logAuditEvent('user_login_failed', { type: 'user', id: user._id }, 'warn', {}, { reason: 'Email not verified' }, req);
            return res.status(403).json({
                message: 'Please verify your email address before logging in. You can request a new verification link.',
                emailNotVerified: true
            });
        }
        if (user.isBanned) {
            await logAuditEvent('user_login_failed', { type: 'user', id: user._id }, 'warn', {}, { reason: 'Account banned' }, req);
            return res.status(403).json({
                message: `Your account has been banned. Reason: ${user.banReason || 'Not specified'}. Please contact support.`,
                accountBanned: true
            });
        }

        const isMatch = await user.comparePassword(password);

        if (isMatch) {
            await logAuditEvent('user_login_success', { type: 'user', id: user._id }, 'info', {}, {}, req);
            // Nie ma potrzeby ponownego User.findById, req.user z 'protect' byłby lepszy, ale tu nie ma 'protect'
            // Model user po findOne jest wystarczający, o ile nie wybieraliśmy specyficznych pól.
            res.json({
                _id: user._id,
                username: user.username,
                email: user.email,
                profile: user.profile,
                role: user.role,
                isTestAccount: user.isTestAccount,
                token: generateToken(user._id),
            });
        } else {
            await logAuditEvent('user_login_failed', { type: 'user', id: user._id }, 'warn', {}, { reason: 'Invalid password' }, req);
            res.status(401).json({ message: 'Invalid email or password' });
        }
    } catch (error) {
        console.error('Login Error:', error);
        await logAuditEvent('user_login_error', { type: 'system' }, 'error', {}, { error: error.message, attemptEmail: email }, req);
        res.status(500).json({ message: 'Server Error during login' });
    }
};

const forgotPassword = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    const { email } = req.body;

    try {
        const user = await User.findOne({ email, isDeleted: false });

        if (user) {
            if (!user.isEmailVerified) {
                 await logAuditEvent('user_forgot_password_attempt_unverified_email', { type: 'user', id: user._id }, 'info', {}, {}, req);
                 // Nadal zwracamy ogólny komunikat, aby nie ujawniać statusu konta
                 return res.status(200).json({ message: 'If an account with that email exists and is active, a password reset link has been sent.' });
            }
            if (user.isBanned) {
                await logAuditEvent('user_forgot_password_attempt_banned_account', { type: 'user', id: user._id }, 'info', {}, {}, req);
                return res.status(200).json({ message: 'If an account with that email exists and is active, a password reset link has been sent.' }); // Ogólny komunikat
            }

            const { token: resetToken, hashedToken: passwordResetToken } = createAndHashToken();
            user.passwordResetToken = passwordResetToken;
            user.passwordResetTokenExpires = Date.now() + 10 * 60 * 1000;
            await user.save({ validateBeforeSave: false });

            const resetURL = `${process.env.FRONTEND_URL || req.protocol + '://' + req.get('host')}/reset-password?token=${resetToken}`;
            const message = `Witaj ${user.username},\n\nOtrzymaliśmy prośbę o zresetowanie hasła dla Twojego konta...`;

            await sendEmail({ email: user.email, subject: 'Reset Hasła w Social App', message });
            await logAuditEvent('user_forgot_password_request_sent', { type: 'user', id: user._id }, 'info', {}, {}, req);
        } else {
            await logAuditEvent('user_forgot_password_attempt_nonexistent_email', { type: 'system' }, 'info', {}, { attemptEmail: email }, req);
        }
        // Zawsze zwracaj ten sam komunikat, aby nie ujawniać, czy email istnieje w bazie
        res.status(200).json({ message: 'If an account with that email exists and is active, a password reset link has been sent.' });
    } catch (error) {
        console.error('Forgot Password Error:', error);
        await logAuditEvent('user_forgot_password_error', {type: 'system'}, 'error', {}, {error: error.message, attemptEmail: email}, req);
        // Nawet przy błędzie serwera, dla bezpieczeństwa można zwrócić ten sam ogólny komunikat
        res.status(200).json({ message: 'If an account with that email exists and is active, and an error occurred processing your request, we are looking into it.' });
    }
};

const resetPassword = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    const { password } = req.body;
    const token = req.params.token;

    try {
        const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
        const user = await User.findOne({
            passwordResetToken: hashedToken,
            passwordResetTokenExpires: { $gt: Date.now() },
            isDeleted: false,
            isBanned: false
        }).select('+password'); // Potrzebujemy hasła do jego nadpisania

        if (!user) {
            await logAuditEvent('user_password_reset_failed', { type: 'system' }, 'warn', {}, { reason: 'Invalid/expired token or inactive/deleted/banned user', tokenAttempt: token }, req);
            return res.status(400).json({ message: 'Invalid or expired password reset token, or account is inactive. Please request a new one.' });
        }

        user.password = password;
        user.passwordResetToken = undefined;
        user.passwordResetTokenExpires = undefined;
        if (!user.isEmailVerified) user.isEmailVerified = true;

        await user.save(); // Hook pre-save zahashuje nowe hasło

        // KONCEPCYJNE - miejsce na blacklistowanie starych tokenów JWT użytkownika
        // await BlacklistService.invalidateUserTokens(user._id);

        await logAuditEvent('user_password_reset_success', { type: 'user', id: user._id }, 'admin_action', {}, {}, req); // admin_action, bo to krytyczna zmiana
        res.status(200).json({ message: 'Password reset successfully. You can now log in with your new password.' });

    } catch (error) {
        console.error('Reset Password Error:', error);
        await logAuditEvent('user_password_reset_error', { type: 'system' }, 'error', {}, { error: error.message, tokenAttempt: token }, req);
        res.status(500).json({ message: 'Server error resetting password.' });
    }
};

module.exports = {
    registerUser,
    loginUser,
    verifyEmail,
    resendVerificationEmail,
    forgotPassword,
    resetPassword
};