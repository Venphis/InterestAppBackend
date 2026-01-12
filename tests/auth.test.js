const request = require('supertest');
const app = require('../server');
const User = require('../models/User');
const sendEmail = require('../utils/sendEmail');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const mongoose = require('mongoose');
const { createUser, createVerifiedUser } = require('./helpers/factories');

describe('Authentication API', () => {
    
    describe('POST /api/auth/register', () => {
        const credentials = {
            username: 'register_test_user',
            email: 'register@test.com',
            password: 'strongPassword123'
        };

        beforeEach(async () => {
            await User.deleteMany({ email: credentials.email });
        });

        it('should register new user and send verification email', async () => {
            const res = await request(app).post('/api/auth/register').send(credentials);

            expect(res.statusCode).toBe(201);
            
            const user = await User.findOne({ email: credentials.email }).select('+emailVerificationToken');
            expect(user.isEmailVerified).toBe(false);
            expect(user.emailVerificationToken).toBeDefined();

            expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({
                email: credentials.email,
                message: expect.stringContaining('/verify-email/')
            }));
        });

        it('should fail if email already exists', async () => {
            await createUser(credentials);
            const res = await request(app).post('/api/auth/register').send(credentials);
            
            expect(res.statusCode).toBe(400);
            expect(res.body.message).toMatch(/exists/);
        });

        it('should validate inputs', async () => {
            const res = await request(app).post('/api/auth/register').send({ email: 'invalid' });
            expect(res.statusCode).toBe(400);
            expect(res.body.errors).toBeDefined();
        });
    });

    describe('GET /api/auth/verify-email/:token', () => {
        let user, token;

        beforeEach(async () => {
            token = crypto.randomBytes(32).toString('hex');
            const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
            
            await User.deleteMany({ email: 'verify@test.com' });
            user = await createUser({
                email: 'verify@test.com',
                emailVerificationToken: hashedToken,
                emailVerificationTokenExpires: Date.now() + 10000
            });
        });

        it('should verify email with valid token', async () => {
            const res = await request(app).get(`/api/auth/verify-email/${token}`);
            
            expect(res.statusCode).toBe(200);
            const updatedUser = await User.findById(user._id);
            expect(updatedUser.isEmailVerified).toBe(true);
        });

        it('should reject invalid token', async () => {
            const res = await request(app).get(`/api/auth/verify-email/${token}invalid`);
            expect(res.statusCode).toBe(400);
        });
    });

    describe('POST /api/auth/login', () => {
        const credentials = { email: 'login@test.com', password: 'password123' };
        let user;

        beforeEach(async () => {
            await User.deleteMany({ email: credentials.email });
            user = await createVerifiedUser(credentials);
        });

        it('should login valid user', async () => {
            const res = await request(app).post('/api/auth/login').send(credentials);
            
            expect(res.statusCode).toBe(200);
            expect(res.body.token).toBeDefined();
        });

        it('should prevent login for unverified user', async () => {
            await User.findByIdAndUpdate(user._id, { isEmailVerified: false });
            
            const res = await request(app).post('/api/auth/login').send(credentials);
            expect(res.statusCode).toBe(403);
        });

        it('should prevent login for banned user', async () => {
            await User.findByIdAndUpdate(user._id, { isBanned: true });
            
            const res = await request(app).post('/api/auth/login').send(credentials);
            expect(res.statusCode).toBe(403);
        });

        it('should reject wrong password', async () => {
            const res = await request(app).post('/api/auth/login').send({ ...credentials, password: 'wrong' });
            expect(res.statusCode).toBe(401);
        });
    });

    describe('Password Reset Flow', () => {
        const email = 'reset@test.com';
        let user;

        beforeEach(async () => {
            await User.deleteMany({ email });
            user = await createVerifiedUser({ email, password: 'oldPassword' });
        });

        it('should send reset link', async () => {
            const res = await request(app).post('/api/auth/forgot-password').send({ email });
            
            expect(res.statusCode).toBe(200);
            expect(sendEmail).toHaveBeenCalled();
            
            const updatedUser = await User.findById(user._id).select('+passwordResetToken');
            expect(updatedUser.passwordResetToken).toBeDefined();
        });

        it('should reset password with valid token', async () => {
            const token = crypto.randomBytes(32).toString('hex');
            const hashed = crypto.createHash('sha256').update(token).digest('hex');
            
            await User.findByIdAndUpdate(user._id, { 
                passwordResetToken: hashed, 
                passwordResetTokenExpires: Date.now() + 10000 
            });

            const res = await request(app)
                .put(`/api/auth/reset-password/${token}`)
                .send({ password: 'newStrongPassword' });

            expect(res.statusCode).toBe(200);
            
            // Verify new password works
            const updatedUser = await User.findById(user._id).select('+password');
            const match = await bcrypt.compare('newStrongPassword', updatedUser.password);
            expect(match).toBe(true);
        });
    });
});