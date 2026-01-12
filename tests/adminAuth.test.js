const request = require('supertest');
const app = require('../server'); 
const AdminUser = require('../models/AdminUser');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { createAdmin, createSuperAdmin } = require('./helpers/factories'); 

describe('Admin Authentication API', () => {
    // Shared credentials
    const credentials = { username: 'superadmin_auth', password: 'superStrongPassword123!' };
    let admin;

    beforeEach(async () => {
        // Clear previous state and create fresh admin
        await mongoose.connection.collection('adminusers').deleteMany({});
        admin = await createSuperAdmin(credentials);
    });

    describe('POST /api/admin/auth/login', () => {
        it('should login active admin and return token', async () => {
            const res = await request(app).post('/api/admin/auth/login').send(credentials);

            expect(res.statusCode).toBe(200);
            expect(res.body.token).toBeDefined();
            expect(res.body.username).toBe(credentials.username);
            expect(res.body.role).toBe('superadmin');
        });

        it('should reject incorrect password', async () => {
            const res = await request(app)
                .post('/api/admin/auth/login')
                .send({ username: credentials.username, password: 'wrongPassword' });
            
            expect(res.statusCode).toBe(401);
            expect(res.body.message).toMatch(/Invalid credentials/i);
        });

        it('should reject inactive admin', async () => {
            await AdminUser.findByIdAndUpdate(admin._id, { isActive: false });
            
            const res = await request(app)
                .post('/api/admin/auth/login')
                .send(credentials);

            expect(res.statusCode).toBe(403);
            expect(res.body.message).toMatch(/inactive/i);
        });

        it('should validate missing fields', async () => {
            const res = await request(app)
                .post('/api/admin/auth/login')
                .send({ username: credentials.username });
            
            expect(res.statusCode).toBe(400);
            expect(res.body.errors).toBeDefined();
        });
    });

    describe('GET /api/admin/auth/me', () => {
        let token;

        beforeEach(async () => {
            const res = await request(app).post('/api/admin/auth/login').send(credentials);
            token = res.body.token;
        });

        it('should retrieve current admin profile', async () => {
            const res = await request(app)
                .get('/api/admin/auth/me')
                .set('Authorization', `Bearer ${token}`);

            expect(res.statusCode).toBe(200);
            expect(res.body._id).toBe(admin._id.toString());
            expect(res.body.username).toBe(credentials.username);
        });

        it('should reject request without token', async () => {
            const res = await request(app).get('/api/admin/auth/me');
            expect(res.statusCode).toBe(401);
        });

        it('should reject request with non-admin token', async () => {
            const secret = process.env.JWT_ADMIN_SECRET || process.env.JWT_SECRET;
            const userToken = jwt.sign({ id: new mongoose.Types.ObjectId(), type: 'user' }, secret);

            const res = await request(app)
                .get('/api/admin/auth/me')
                .set('Authorization', `Bearer ${userToken}`);
            
            expect(res.statusCode).toBe(403);
            expect(res.body.message).toMatch(/not an admin token/i);
        });
    });

    describe('PUT /api/admin/auth/change-password', () => {
        let token;
        const newPassword = 'newPassword123!';

        beforeEach(async () => {
            const res = await request(app).post('/api/admin/auth/login').send(credentials);
            token = res.body.token;
        });

        it('should update password successfully', async () => {
            const res = await request(app)
                .put('/api/admin/auth/change-password')
                .set('Authorization', `Bearer ${token}`)
                .send({
                    currentPassword: credentials.password,
                    newPassword: newPassword,
                    confirmNewPassword: newPassword
                });

            expect(res.statusCode).toBe(200);

            const loginRes = await request(app)
                .post('/api/admin/auth/login')
                .send({ username: credentials.username, password: newPassword });
            
            expect(loginRes.statusCode).toBe(200);
        });

        it('should reject incorrect current password', async () => {
            const res = await request(app)
                .put('/api/admin/auth/change-password')
                .set('Authorization', `Bearer ${token}`)
                .send({
                    currentPassword: 'wrongPassword',
                    newPassword: newPassword,
                    confirmNewPassword: newPassword
                });

            expect(res.statusCode).toBe(401);
        });

        it('should reject mismatching new passwords', async () => {
            const res = await request(app)
                .put('/api/admin/auth/change-password')
                .set('Authorization', `Bearer ${token}`)
                .send({
                    currentPassword: credentials.password,
                    newPassword: newPassword,
                    confirmNewPassword: 'mismatchingPassword'
                });

            expect(res.statusCode).toBe(400);
        });
    });

    describe('POST /api/admin/auth/logout', () => {
        let token;

        beforeEach(async () => {
            const res = await request(app).post('/api/admin/auth/login').send(credentials);
            token = res.body.token;
        });

        it('should logout successfully', async () => {
            const res = await request(app)
                .post('/api/admin/auth/logout')
                .set('Authorization', `Bearer ${token}`);

            expect(res.statusCode).toBe(200);
            expect(res.body.message).toMatch(/logged out/i);
        });
    });
});