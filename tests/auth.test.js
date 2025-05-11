// tests/auth.test.js
const request = require('supertest');
const app = require('../server'); // Importuj 'app' z poprawionego server.js
const User = require('../models/User');
const sendEmailOriginal = require('../utils/sendEmail'); // Zmień nazwę
jest.mock('../utils/sendEmail', () => jest.fn().mockResolvedValue(true)); 
const sendEmail = require('../utils/sendEmail'); // Importuj, aby móc na nim robić asercje
const bcrypt = require('bcrypt');

// Nie potrzebujemy już tutaj mongod, mongoose ani beforeAll/afterAll/beforeEach
// dla bazy danych, ponieważ jest to obsługiwane globalnie przez jest.setup.js

describe('Auth API - Registration', () => {
    const validUser = {
        username: 'testuser',
        email: 'test@example.com',
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

        expect(sendEmail).toHaveBeenCalledTimes(1);
        expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({
            email: validUser.email,
            subject: expect.stringContaining('Aktywacja Konta'),
        }));
    });

    it('should not register a user with an existing email', async () => {
        await User.create(validUser); // Stwórz użytkownika bezpośrednio w bazie
        const res = await request(app)
            .post('/api/auth/register')
            .send({ ...validUser, username: 'anotheruser' });

        expect(res.statusCode).toEqual(400);
        expect(res.body).toHaveProperty('message', 'User with this email or username already exists');
    });

    it('should return validation errors for invalid registration data', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send({ username: 'u', email: 'not-an-email', password: '123' });

        expect(res.statusCode).toEqual(400);
        expect(res.body).toHaveProperty('errors');
        expect(res.body.errors.length).toBeGreaterThan(0);
        // Możesz dodać bardziej szczegółowe asercje na temat konkretnych błędów walidacji
    });
});

describe('Auth API - Login', () => {
    const loginCredentials = {
        email: 'login@example.com',
        password: 'password123',
    };

    beforeEach(async () => {
        // await User.deleteMany({}); // To jest obsługiwane przez globalne beforeEach w jest.setup.js
        // Stwórz użytkownika z czystym tekstem hasła, hook w modelu go zahashuje
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

// TODO: Dodaj testy dla /verify-email, /resend-verification-email, /forgot-password, /reset-password
// Testowanie verify-email i reset-password będzie wymagało przechwycenia tokenu
// wysłanego w emailu (lub wygenerowania go w teście i wstawienia do bazy)