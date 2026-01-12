const User = require('../models/User');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const sendEmail = require('../utils/sendEmail');
const logAuditEvent = require('../utils/auditLogger');
const { validationResult } = require('express-validator');
require('dotenv').config();

// Helper: JWT generation
const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '30d' });
};

// Helper: Random token creation with hash
const createAndHashToken = () => {
    const token = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    return { token, hashedToken };
};

const registerUser = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { username, email, password } = req.body;

    try {
        const existingUser = await User.findOne({ $or: [{ email }, { username }] });
        
        if (existingUser) {
            const reason = existingUser.isDeleted ? 'deleted_account' : 'existing_account';
            await logAuditEvent(`registration_fail_${reason}`, { type: 'system' }, 'warn', {}, { email, username }, req);
            return res.status(400).json({ message: 'User with this email or username already exists' });
        }

        const { token, hashedToken } = createAndHashToken();
        const expires = Date.now() + 10 * 60 * 1000; // 10 minutes

        const user = await User.create({
            username,
            email,
            password,
            emailVerificationToken: hashedToken,
            emailVerificationTokenExpires: expires,
        });

        const verificationURL = `${req.protocol}://${req.get('host')}/api/auth/verify-email/${token}`;
        
        await sendEmail({
            email: user.email,
            subject: `Activate your ${process.env.APP_NAME} account`,
            message: `Welcome ${user.username}!\n\nPlease click the link to activate your account:\n${verificationURL}\n\nLink expires in 10 minutes.`
        });

        await logAuditEvent('user_registered', { type: 'user', id: user._id }, 'info', {}, { email }, req);
        
        res.status(201).json({ message: 'Registration successful. Check email for activation link.' });
    } catch (error) {
        console.error('Registration Error:', error.message);
        next(error);
    }
};

const verifyEmail = async (req, res, next) => {
    try {
        const hashedToken = crypto.createHash('sha256').update(req.params.token).digest('hex');

        const user = await User.findOne({
            emailVerificationToken: hashedToken,
            emailVerificationTokenExpires: { $gt: Date.now() }
        });

        if (!user) {
            await logAuditEvent('email_verify_failed', { type: 'system' }, 'warn', {}, { token: req.params.token }, req);
            return res.status(400).json({ message: 'Invalid or expired token' });
        }

        user.isEmailVerified = true;
        user.emailVerificationToken = undefined;
        user.emailVerificationTokenExpires = undefined;

        // Auto-restore if was deleted
        if (user.isDeleted) {
            user.isDeleted = false;
            user.deletedAt = null;
        }

        await user.save({ validateBeforeSave: false });
        await logAuditEvent('user_email_verified', { type: 'user', id: user._id }, 'info', {}, {}, req);
        
        res.status(200).json({ message: 'Email verified. You can now log in.' });
    } catch (error) {
        console.error('Verify Email Error:', error.message);
        next(error);
    }
};

const resendVerificationEmail = async (req, res, next) => {
    const { email } = req.body;

    try {
        const user = await User.findOne({ email });
        
        if (!user) return res.status(404).json({ message: 'User not found' });
        if (user.isEmailVerified) return res.status(400).json({ message: 'Email already verified' });
        if (user.isBanned || user.isDeleted) return res.status(403).json({ message: 'Account suspended or deleted' });

        const { token, hashedToken } = createAndHashToken();
        user.emailVerificationToken = hashedToken;
        user.emailVerificationTokenExpires = Date.now() + 10 * 60 * 1000;
        await user.save({ validateBeforeSave: false });

        const verificationURL = `${req.protocol}://${req.get('host')}/api/auth/verify-email/${token}`;
        
        await sendEmail({
            email: user.email,
            subject: `Resend Activation - ${process.env.APP_NAME}`,
            message: `Click to activate:\n${verificationURL}`
        });

        await logAuditEvent('verification_resent', { type: 'user', id: user._id }, 'info', {}, {}, req);
        res.status(200).json({ message: 'Verification email resent' });
    } catch (error) {
        next(error);
    }
};

const loginUser = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { email, password } = req.body;

    try {
        const user = await User.findOne({ email, isDeleted: false }).select('+backup');

        if (!user) {
            await logAuditEvent('login_failed', { type: 'system' }, 'warn', {}, { email, reason: 'Not found' }, req);
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        if (!user.isEmailVerified) return res.status(403).json({ message: 'Email not verified', emailNotVerified: true });
        if (user.isBanned) return res.status(403).json({ message: 'Account banned', accountBanned: true });

        const isMatch = await user.comparePassword(password);
        
        if (!isMatch) {
            await logAuditEvent('login_failed', { type: 'user', id: user._id }, 'warn', {}, { reason: 'Wrong password' }, req);
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const isBackedUp = !!(user.backup?.encryptedPrivateKey && user.backup?.encryptedBackupKey);

        await logAuditEvent('login_success', { type: 'user', id: user._id }, 'info', {}, {}, req);
        
        res.json({
            _id: user._id,
            username: user.username,
            email: user.email,
            profile: user.profile,
            role: user.role,
            isTestAccount: user.isTestAccount,
            token: generateToken(user._id),
            isBackedUp
        });
    } catch (error) {
        console.error('Login Error:', error.message);
        next(error);
    }
};

const forgotPassword = async (req, res, next) => {
    const { email } = req.body;

    try {
        const user = await User.findOne({ email, isDeleted: false });

        if (user && user.isEmailVerified && !user.isBanned) {
            const { token, hashedToken } = createAndHashToken();
            user.passwordResetToken = hashedToken;
            user.passwordResetTokenExpires = Date.now() + 10 * 60 * 1000;
            await user.save({ validateBeforeSave: false });

            const resetURL = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;
            
            await sendEmail({
                email: user.email,
                subject: `Password Reset - ${process.env.APP_NAME}`,
                message: `Click to reset password:\n${resetURL}`
            });

            await logAuditEvent('password_reset_requested', { type: 'user', id: user._id }, 'info', {}, {}, req);
        }
        
        // Always return success to prevent email enumeration
        res.status(200).json({ message: 'If account exists, reset link sent.' });
    } catch (error) {
        next(error);
    }
};

const resetPassword = async (req, res, next) => {
    const { password } = req.body;
    const { token } = req.params;

    try {
        const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
        
        const user = await User.findOne({
            passwordResetToken: hashedToken,
            passwordResetTokenExpires: { $gt: Date.now() },
            isDeleted: false,
            isBanned: false
        });

        if (!user) return res.status(400).json({ message: 'Invalid or expired token' });

        user.password = password;
        user.passwordResetToken = undefined;
        user.passwordResetTokenExpires = undefined;
        user.isEmailVerified = true; // Implicit verification on password reset

        await user.save();
        await logAuditEvent('password_reset_success', { type: 'user', id: user._id }, 'admin_action', {}, {}, req);
        
        res.status(200).json({ message: 'Password reset successfully' });
    } catch (error) {
        next(error);
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