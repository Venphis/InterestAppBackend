// tests/auth.test.js
const request = require('supertest');
const app = require('../server'); // Importuj 'app' z server.js
const User = require('../models/User'); // Nadal potrzebne do asercji i specyficznych operacji na bazie
const sendEmail = require('../utils/sendEmail'); // Mockowany w jest.setup.js
const bcrypt = require('bcrypt'); // Potrzebny do sprawdzania hasła po resecie
const crypto = require('crypto');
const mongoose = require('mongoose'); // Potrzebny do new mongoose.Types.ObjectId()
const { createUser, createVerifiedUser } = require('./helpers/factories'); // IMPORT HELPERÓW

// Globalne beforeEach z jest.setup.js czyści mocki.
// Czyszczenie kolekcji User będzie robione w każdym `describe` lub `beforeEach` w tym pliku.

describe('Auth API - Registration', () => {
    const validUserCredentials = {
        username: 'testuserReg_auth',
        email: 'testreg_auth@example.com',
        password: 'password123',
    };

    beforeEach(async () => {
        // Czyść kolekcję User przed każdym testem rejestracji, aby uniknąć konfliktów
        await mongoose.connection.collection('users').deleteMany({
            $or: [
                { email: validUserCredentials.email },
                { username: validUserCredentials.username }
            ]
        });
    });

    it('should register a new user successfully and call sendEmail', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send(validUserCredentials);

        expect(res.statusCode).toEqual(201);
        expect(res.body).toHaveProperty('message', 'User registered successfully. Please check your email to activate your account.');

        const userInDb = await User.findOne({ email: validUserCredentials.email }).select('+emailVerificationToken');
        expect(userInDb).not.toBeNull();
        expect(userInDb.username).toBe(validUserCredentials.username);
        expect(userInDb.isEmailVerified).toBe(false);
        expect(userInDb.emailVerificationToken).toBeDefined();
        expect(userInDb.emailVerificationToken).not.toBeNull();

        expect(sendEmail).toHaveBeenCalledTimes(1);
        expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({
            email: validUserCredentials.email,
            subject: expect.stringContaining(`Aktywacja Konta w ${process.env.APP_NAME || 'Hello Beacon'}`),
            message: expect.stringContaining('/api/auth/verify-email/')
        }));
    });

    it('should not register a user with an existing email', async () => {
        await createUser(validUserCredentials); // Użyj fabryki do stworzenia użytkownika
        const res = await request(app)
            .post('/api/auth/register')
            .send({ ...validUserCredentials, username: 'anotheruserReg_auth' });
        expect(res.statusCode).toEqual(400);
        expect(res.body).toHaveProperty('message', 'User with this email or username already exists');
    });

    it('should return validation errors for invalid registration data', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send({ username: 'u', email: 'not-an-email', password: '123' });
        expect(res.statusCode).toEqual(400);
        expect(res.body).toHaveProperty('errors');
        // Można dodać bardziej szczegółowe asercje, np.
        // expect(res.body.errors.some(e => e.path === 'username' && e.msg.includes('3 characters'))).toBe(true);
    });
});

describe('Auth API - Email Verification', () => {
    let userToVerify;
    let rawVerificationToken;

    beforeEach(async () => {
        await mongoose.connection.collection('users').deleteMany({ email: 'verify_auth@example.com' });
        const tokenData = crypto.randomBytes(32).toString('hex');
        rawVerificationToken = tokenData;
        const hashedToken = crypto.createHash('sha256').update(tokenData).digest('hex');

        userToVerify = await createUser({ // Użyj fabryki
            username: 'verifyuser_auth',
            email: 'verify_auth@example.com',
            isEmailVerified: false,
            emailVerificationToken: hashedToken,
            emailVerificationTokenExpires: new Date(Date.now() + 10 * 60 * 1000)
        });
    });

    it('should verify email with a valid token', async () => {
        const res = await request(app)
            .get(`/api/auth/verify-email/${rawVerificationToken}`);

        expect(res.statusCode).toEqual(200);
        expect(res.body).toHaveProperty('message', 'Email verified successfully. You can now log in.');

        const updatedUser = await User.findById(userToVerify._id);
        expect(updatedUser.isEmailVerified).toBe(true);
        expect(updatedUser.emailVerificationToken).toBeUndefined();
    });

    it('should not verify email with an invalid token (format)', async () => {
    const res = await request(app)
        .get(`/api/auth/verify-email/invalidtoken123`);
    expect(res.statusCode).toEqual(400);
    expect(res.body.errors[0].msg).toBe('Token must be hexadecimal'); // Ten test powinien nadal przechodzić
});

    it('should not verify email with an expired token', async () => {
        await User.updateOne({ _id: userToVerify._id }, {
            emailVerificationTokenExpires: new Date(Date.now() - 1000)
        });
        const res = await request(app)
            .get(`/api/auth/verify-email/${rawVerificationToken}`);
        expect(res.statusCode).toEqual(400);
        expect(res.body).toHaveProperty('message', expect.stringContaining('Invalid or expired verification token'));
    });
});


describe('Auth API - Resend Verification Email', () => {
    beforeEach(async () => {
        await mongoose.connection.collection('users').deleteMany({ email: /resend_auth@example\.com$/ });
    });

    it('should resend verification email for unverified user', async () => {
        const unverifiedUser = await createUser({ // Użyj fabryki
            username: 'resenduser_auth', email: 'resend_auth@example.com', isEmailVerified: false
        });
        const res = await request(app)
            .post('/api/auth/resend-verification-email')
            .send({ email: unverifiedUser.email });

        expect(res.statusCode).toEqual(200);
        expect(res.body).toHaveProperty('message', 'Verification email resent. Please check your inbox.');
        expect(sendEmail).toHaveBeenCalledTimes(1);
        expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({
            email: unverifiedUser.email,
            subject: expect.stringContaining(`Ponowna Aktywacja Konta w ${process.env.APP_NAME || 'Hello Beacon'}`)
        }));
    });

    it('should not resend for already verified user', async () => {
        const verifiedUser = await createVerifiedUser({ // Użyj fabryki
            username: 'verifiedresend_auth', email: 'resend_auth@example.com'
        });
        const res = await request(app)
            .post('/api/auth/resend-verification-email')
            .send({ email: verifiedUser.email });
        expect(res.statusCode).toEqual(400);
        expect(res.body).toHaveProperty('message', 'This email is already verified.');
    });
});


describe('Auth API - Login', () => {
    const baseLoginCredentials = { // Użyj unikalnych danych dla tego bloku describe
        email: 'login_user_auth@example.com',
        password: 'password123',
    };
    let userForLoginTests;

    beforeEach(async () => {
        // Czyść użytkownika z tego emaila przed każdym testem w tym bloku
        await mongoose.connection.collection('users').deleteMany({ email: baseLoginCredentials.email });
        // Stwórz domyślnie aktywnego, zweryfikowanego użytkownika
        userForLoginTests = await createVerifiedUser({
            username: 'login_user_specific',
            email: baseLoginCredentials.email,
            password: baseLoginCredentials.password,
        });
    });

    it('should login an existing and verified user', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send(baseLoginCredentials);

        expect(res.statusCode).toEqual(200);
        expect(res.body).toHaveProperty('token');
        expect(res.body.email).toBe(baseLoginCredentials.email);
    });

    it('should not login a user with incorrect password', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: baseLoginCredentials.email, password: 'wrongpassword' });

        expect(res.statusCode).toEqual(401);
        expect(res.body).toHaveProperty('message', 'Invalid email or password');
    });

    it('should not login an unverified user', async () => {
        // Zmodyfikuj użytkownika stworzonego w beforeEach
        await User.updateOne({ _id: userForLoginTests._id }, { isEmailVerified: false });

        const res = await request(app)
            .post('/api/auth/login')
            .send(baseLoginCredentials);

        expect(res.statusCode).toEqual(403);
        expect(res.body).toHaveProperty('message', 'Please verify your email address before logging in. You can request a new verification link.');
        expect(res.body).toHaveProperty('emailNotVerified', true);
    });

    it('should not login a banned user', async () => {
        // Zmodyfikuj użytkownika stworzonego w beforeEach
        await User.updateOne({ _id: userForLoginTests._id }, { isBanned: true, banReason: 'Test ban for login' });

        const res = await request(app)
            .post('/api/auth/login')
            .send(baseLoginCredentials);

        expect(res.statusCode).toEqual(403);
        expect(res.body).toHaveProperty('message', expect.stringContaining('Your account has been banned. Reason: Test ban for login'));
        expect(res.body).toHaveProperty('accountBanned', true);
    });

    it('should not login a soft-deleted user', async () => {
        // Zmodyfikuj użytkownika stworzonego w beforeEach
        await User.updateOne({ _id: userForLoginTests._id }, { isDeleted: true, deletedAt: new Date() });

        const res = await request(app)
            .post('/api/auth/login')
            .send(baseLoginCredentials);
        // Oczekujemy 401, ponieważ User.findOne({ email, isDeleted: false }) nie znajdzie użytkownika
        expect(res.statusCode).toEqual(401);
        expect(res.body).toHaveProperty('message', 'Invalid email or password');
    });
});


describe('Auth API - Password Reset', () => {
    let userForPasswordReset;
    const userEmailForReset = 'resetpass_auth@example.com';

    beforeEach(async () => {
        await mongoose.connection.collection('users').deleteMany({ email: userEmailForReset });
        userForPasswordReset = await createVerifiedUser({ // Użyj fabryki
            username: 'resetpassuser_auth',
            email: userEmailForReset,
            password: 'oldpassword123',
        });
    });

    it('should send a password reset link for existing verified user', async () => {
        const res = await request(app)
            .post('/api/auth/forgot-password')
            .send({ email: userEmailForReset });

        expect(res.statusCode).toEqual(200);
        expect(res.body).toHaveProperty('message', expect.stringContaining('a password reset link has been sent'));
        expect(sendEmail).toHaveBeenCalledTimes(1);
        expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({
            email: userEmailForReset,
            subject: `Reset Hasła w ${process.env.APP_NAME || 'Hello Beacon'}`
        }));
        const userInDb = await User.findOne({ email: userEmailForReset }).select('+passwordResetToken');
        expect(userInDb.passwordResetToken).toBeDefined();
    });

    it('should reset password with a valid token', async () => {
        const rawResetToken = crypto.randomBytes(32).toString('hex');
        const passwordResetTokenForDb = crypto.createHash('sha256').update(rawResetToken).digest('hex');

        await User.updateOne({ _id: userForPasswordReset._id }, {
            passwordResetToken: passwordResetTokenForDb,
            passwordResetTokenExpires: new Date(Date.now() + 10 * 60 * 1000)
        });

        const newPassword = 'newStrongPassword123';
        const res = await request(app)
            .put(`/api/auth/reset-password/${rawResetToken}`)
            .send({ password: newPassword });

        expect(res.statusCode).toEqual(200);
        expect(res.body).toHaveProperty('message', 'Password reset successfully. You can now log in with your new password.');

        const updatedUser = await User.findById(userForPasswordReset._id).select('+password');
        expect(updatedUser.passwordResetToken).toBeUndefined();
        const isMatch = await bcrypt.compare(newPassword, updatedUser.password);
        expect(isMatch).toBe(true);
    });

    it('should not reset password with an invalid or expired token (format)', async () => {
        const res = await request(app)
            .put(`/api/auth/reset-password/invalidOrExpiredToken123`)
            .send({ password: 'newpassword123' });
        expect(res.statusCode).toEqual(400);
        expect(res.body.errors[0].msg).toBe('Token must be hexadecimal');
    });
});