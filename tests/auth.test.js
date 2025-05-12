// tests/auth.test.js
const request = require('supertest');
const app = require('../server'); // Importuj 'app' z poprawionego server.js
const User = require('../models/User');
jest.mock('../utils/sendEmail', () => jest.fn().mockResolvedValue(true)); 
const sendEmail = require('../utils/sendEmail'); // Importuj, aby móc na nim robić asercje
const bcrypt = require('bcrypt');
const crypto = require('crypto'); // Potrzebne do hashowania tokenów w teście


// Nie potrzebujemy już tutaj mongod, mongoose ani beforeAll/afterAll/beforeEach
// dla bazy danych, ponieważ jest to obsługiwane globalnie przez jest.setup.js

describe('Auth API - Registration', () => {
    const validUser = {
        username: 'testuserReg', // Inne nazwy dla różnych bloków describe
        email: 'testreg@example.com',
        password: 'password123',
    };

    it('should register a new user successfully and call sendEmail', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send(validUser);

        expect(res.statusCode).toEqual(201);
        expect(res.body).toHaveProperty('message', 'User registered successfully. Please check your email to activate your account.');

        const userInDb = await User.findOne({ email: validUser.email }).select('+emailVerificationToken');
        expect(userInDb).not.toBeNull();
        expect(userInDb.username).toBe(validUser.username);
        expect(userInDb.isEmailVerified).toBe(false);
        expect(userInDb.emailVerificationToken).toBeDefined();
        expect(userInDb.emailVerificationToken).not.toBeNull();

        expect(sendEmail).toHaveBeenCalledTimes(1);
        expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({
            email: validUser.email,
            subject: expect.stringContaining('Aktywacja Konta'),
            message: expect.stringContaining('/api/auth/verify-email/') // Sprawdź, czy link jest w wiadomości
        }));
    });

    it('should not register a user with an existing email', async () => {
        await User.create(validUser);
        const res = await request(app)
            .post('/api/auth/register')
            .send({ ...validUser, username: 'anotheruserReg' });
        expect(res.statusCode).toEqual(400);
    });

    it('should return validation errors for invalid registration data', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send({ username: 'u', email: 'not-an-email', password: '123' });
        expect(res.statusCode).toEqual(400);
        expect(res.body).toHaveProperty('errors');
    });
});

describe('Auth API - Email Verification', () => {
    let userToVerify;
    let rawVerificationToken; // Niehashowany token, który byłby w URLu

    beforeEach(async () => {
        const tokenData = crypto.randomBytes(32).toString('hex');
        rawVerificationToken = tokenData; // To jest to, co byłoby w linku
        const hashedToken = crypto.createHash('sha256').update(tokenData).digest('hex');

        userToVerify = await User.create({
            username: 'verifyuser',
            email: 'verify@example.com',
            password: 'password123',
            isEmailVerified: false,
            emailVerificationToken: hashedToken,
            emailVerificationTokenExpires: new Date(Date.now() + 10 * 60 * 1000) // Ważny 10 minut
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

    it('should not verify email with an invalid token', async () => {
        const res = await request(app)
            .get(`/api/auth/verify-email/invalidtoken123`);
        expect(res.statusCode).toEqual(400);
        // "invalidtoken123" nie jest hex, więc pierwszy błąd powinien być od isHexadecimal()
        expect(res.body.errors[0].msg).toBe('Invalid token format (not hex)');
    });

    it('should not verify email with an expired token', async () => {
        // Ustaw token jako wygasły
        await User.updateOne({ _id: userToVerify._id }, {
            emailVerificationTokenExpires: new Date(Date.now() - 1000) // Już wygasł
        });

        const res = await request(app)
            .get(`/api/auth/verify-email/${rawVerificationToken}`);
        expect(res.statusCode).toEqual(400);
        expect(res.body).toHaveProperty('message', expect.stringContaining('Invalid or expired verification token'));
    });
});


describe('Auth API - Resend Verification Email', () => {
    it('should resend verification email for unverified user', async () => {
        const unverifiedUser = await User.create({
            username: 'resenduser', email: 'resend@example.com', password: 'password123', isEmailVerified: false
        });

        const res = await request(app)
            .post('/api/auth/resend-verification-email')
            .send({ email: unverifiedUser.email });

        expect(res.statusCode).toEqual(200);
        expect(res.body).toHaveProperty('message', 'Verification email resent. Please check your inbox.');
        expect(sendEmail).toHaveBeenCalledTimes(1); // sendEmail jest czyszczony w jest.setup.js beforeEach
        expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({
            email: unverifiedUser.email,
            subject: expect.stringContaining('Ponowna Aktywacja Konta')
        }));
    });

    it('should not resend for already verified user', async () => {
        const verifiedUser = await User.create({
            username: 'verifiedresend', email: 'verifiedresend@example.com', password: 'password123', isEmailVerified: true
        });
        const res = await request(app)
            .post('/api/auth/resend-verification-email')
            .send({ email: verifiedUser.email });
        expect(res.statusCode).toEqual(400);
        expect(res.body).toHaveProperty('message', 'This email is already verified.');
    });
});



describe('Auth API - Login', () => {
    const loginCredentials = {
        email: 'login@example.com',
        password: 'password123',
    };

    beforeEach(async () => {
        await User.create({
            username: 'loginuser',
            email: loginCredentials.email,
            password: loginCredentials.password, // Czysty tekst hasła
            isEmailVerified: true,
            isBanned: false,
            isDeleted: false,
        });
    });


    it('should login an existing and verified user', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send(loginCredentials);

        expect(res.statusCode).toEqual(200);
        expect(res.body).toHaveProperty('token');
        expect(res.body.email).toBe(loginCredentials.email);
    });

    it('should not login a user with incorrect password', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: loginCredentials.email, password: 'wrongpassword' });

        expect(res.statusCode).toEqual(401);
        expect(res.body).toHaveProperty('message', 'Invalid email or password');
    });

    it('should not login an unverified user', async () => {
        await User.updateOne({ email: loginCredentials.email }, { isEmailVerified: false });
        const res = await request(app)
            .post('/api/auth/login')
            .send(loginCredentials);

        expect(res.statusCode).toEqual(403);
        expect(res.body).toHaveProperty('emailNotVerified', true);
    });

    it('should not login a banned user', async () => {
        await User.updateOne({ email: loginCredentials.email }, { isBanned: true, banReason: 'Test ban' });
        const res = await request(app)
            .post('/api/auth/login')
            .send(loginCredentials);

        expect(res.statusCode).toEqual(403);
        expect(res.body).toHaveProperty('accountBanned', true);
    });

    it('should not login a soft-deleted user', async () => {
        await User.updateOne({ email: loginCredentials.email }, { isDeleted: true, deletedAt: new Date() });
        const res = await request(app)
            .post('/api/auth/login')
            .send(loginCredentials);
        expect(res.statusCode).toEqual(401); // Bo findOne({ email, isDeleted: false }) nie znajdzie
    });
});

describe('Auth API - Password Reset', () => {
    let userForPasswordReset;
    const userEmail = 'resetpass@example.com';

    beforeEach(async () => {
        userForPasswordReset = await User.create({
            username: 'resetpassuser',
            email: userEmail,
            password: 'oldpassword123',
            isEmailVerified: true, // Użytkownik musi być zweryfikowany, aby zresetować hasło (zgodnie z logiką kontrolera)
            isBanned: false,
            isDeleted: false,
        });
    });

    it('should send a password reset link for existing verified user', async () => {
        const res = await request(app)
            .post('/api/auth/forgot-password')
            .send({ email: userEmail });

        expect(res.statusCode).toEqual(200);
        expect(res.body).toHaveProperty('message', expect.stringContaining('a password reset link has been sent'));
        expect(sendEmail).toHaveBeenCalledTimes(1);
        expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({
            email: userEmail,
            subject: `Reset Hasła w ${process.env.APP_NAME || 'Hello Beacon'}` // Użyj poprawnej nazwy
        }));

        // Sprawdź, czy token został zapisany w bazie
        const userInDb = await User.findOne({ email: userEmail }).select('+passwordResetToken');
        expect(userInDb.passwordResetToken).toBeDefined();
    });

    it('should reset password with a valid token', async () => {
    const rawResetToken = crypto.randomBytes(32).toString('hex');
    const passwordResetTokenForDb = crypto.createHash('sha256').update(rawResetToken).digest('hex');

    await User.updateOne({ _id: userForPasswordReset._id }, {
        passwordResetToken: passwordResetTokenForDb, // Zapisz zahashowany do bazy
        passwordResetTokenExpires: new Date(Date.now() + 10 * 60 * 1000)
    });

    const newPassword = 'newStrongPassword123';
    const res = await request(app)
        .put(`/api/auth/reset-password/${rawResetToken}`) // Użyj niehashowanego (raw) tokenu w URL
        .send({ password: newPassword });

        expect(res.statusCode).toEqual(200);
        expect(res.body).toHaveProperty('message', 'Password reset successfully. You can now log in with your new password.');

        // Krok 3: Sprawdź, czy hasło zostało zmienione i tokeny usunięte
        const updatedUser = await User.findById(userForPasswordReset._id).select('+password');
        expect(updatedUser.passwordResetToken).toBeUndefined();
        const isMatch = await bcrypt.compare(newPassword, updatedUser.password);
        expect(isMatch).toBe(true);
    });

    it('should not reset password with an invalid or expired token', async () => {
        const res = await request(app)
            .put(`/api/auth/reset-password/invalidOrExpiredToken123`)
            .send({ password: 'newpassword123' });
        expect(res.statusCode).toEqual(400);
        expect(res.body.errors[0].msg).toBe('Invalid token format (not hex)');
    });
});