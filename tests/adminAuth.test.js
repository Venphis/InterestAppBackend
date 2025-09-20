const request = require('supertest');
const app = require('../server'); 
const AdminUser = require('../models/AdminUser');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { createAdmin, createSuperAdmin } = require('./helpers/factories'); 

describe('Admin Auth API', () => {
    const baseAdminCredentials = {
        username: 'testsuperadmin_auth', 
        password: 'superStrongPassword123!',
    };

    describe('POST /api/admin/auth/login', () => {
        let adminForLoginTest;

        beforeEach(async () => {
            await mongoose.connection.collection('adminusers').deleteMany({ username: baseAdminCredentials.username });
            adminForLoginTest = await createSuperAdmin({ 
                username: baseAdminCredentials.username,
                password: baseAdminCredentials.password, 
            });
        });

        it('should login an existing active admin and return a token', async () => {
            const res = await request(app)
                .post('/api/admin/auth/login')
                .send(baseAdminCredentials);

            expect(res.statusCode).toEqual(200);
            expect(res.body).toHaveProperty('token');
            expect(res.body).toHaveProperty('username', baseAdminCredentials.username);
            expect(res.body).toHaveProperty('role', 'superadmin');
            expect(res.body._id).toBe(adminForLoginTest._id.toString());
        });

        it('should not login with incorrect password', async () => {
            const res = await request(app)
                .post('/api/admin/auth/login')
                .send({ username: baseAdminCredentials.username, password: 'wrongPassword' });
            expect(res.statusCode).toEqual(401);
            expect(res.body.message).toMatch(/Invalid admin credentials/i);
        });

        it('should not login a non-existent admin', async () => {
            const res = await request(app)
                .post('/api/admin/auth/login')
                .send({ username: 'nonexistentadmin_auth', password: 'password' });
            expect(res.statusCode).toEqual(401);
            expect(res.body.message).toMatch(/Invalid admin credentials or admin not found/i);
        });

        it('should not login an inactive admin', async () => {
            await AdminUser.updateOne({ _id: adminForLoginTest._id }, { isActive: false });
            const res = await request(app)
                .post('/api/admin/auth/login')
                .send(baseAdminCredentials);
            expect(res.statusCode).toEqual(403);
            expect(res.body).toHaveProperty('message', 'Admin account is inactive');
        });

        it('should return validation errors for missing credentials', async () => {
            const res = await request(app)
                .post('/api/admin/auth/login')
                .send({ username: baseAdminCredentials.username }); 
            expect(res.statusCode).toEqual(400);
            expect(res.body).toHaveProperty('errors');
            expect(res.body.errors.some(err => err.path === 'password')).toBe(true);
        });
    });

    describe('GET /api/admin/auth/me', () => {
        let currentAdminToken;
        let currentAdminId;
        const meAdminCredentials = { username: 'meAdminUser_auth', password: 'mePassword123' };


        beforeEach(async () => {
            await mongoose.connection.collection('adminusers').deleteMany({username: meAdminCredentials.username });
            const admin = await createAdmin({ 
                username: meAdminCredentials.username,
                password: meAdminCredentials.password,
                role: 'admin' 
            });
            currentAdminId = admin._id.toString();

            const loginRes = await request(app)
                .post('/api/admin/auth/login')
                .send(meAdminCredentials);
            expect(loginRes.statusCode).toBe(200);
            currentAdminToken = loginRes.body.token;
            if (!currentAdminToken) throw new Error("Failed to get admin token in GET /me beforeEach");
        });

        it('should get current admin profile with a valid admin token', async () => {
            const res = await request(app)
                .get('/api/admin/auth/me')
                .set('Authorization', `Bearer ${currentAdminToken}`);
            expect(res.statusCode).toEqual(200);
            expect(res.body._id).toBe(currentAdminId);
            expect(res.body.username).toBe(meAdminCredentials.username);
        });

        it('should not get profile without a token', async () => {
            const res = await request(app).get('/api/admin/auth/me');
            expect(res.statusCode).toEqual(401);
            expect(res.body).toHaveProperty('message', 'Not authorized, no admin token or malformed header');
        });

        it('should not get profile with a regular user token (expecting "token is not an admin token")', async () => {
            if (!process.env.JWT_ADMIN_SECRET && !process.env.JWT_SECRET) { 
                throw new Error("Admin or User JWT secret is undefined for user-typed token test!");
            }
            const secretForUserTypeToken = process.env.JWT_ADMIN_SECRET || process.env.JWT_SECRET;
            const userTestToken = jwt.sign({ id: new mongoose.Types.ObjectId().toString(), type: 'user' }, secretForUserTypeToken);

            const res = await request(app)
                .get('/api/admin/auth/me')
                .set('Authorization', `Bearer ${userTestToken}`);
            expect(res.statusCode).toEqual(401);
            expect(res.body.message).toBe('token is not an admin token');
        });
    });

    describe('PUT /api/admin/auth/change-password', () => {
        let changePassAdminToken;
        const changePassAdminCreds = { username: 'changepw_auth', password: 'oldPassword123' };
        const newPassword = 'newSuperStrongPassword456!';

        beforeEach(async () => {
            await mongoose.connection.collection('adminusers').deleteMany({username: changePassAdminCreds.username });
            await createAdmin({ 
                username: changePassAdminCreds.username,
                password: changePassAdminCreds.password
            });
            const loginRes = await request(app).post('/api/admin/auth/login').send(changePassAdminCreds);
            expect(loginRes.statusCode).toBe(200);
            changePassAdminToken = loginRes.body.token;
            if (!changePassAdminToken) throw new Error("Failed to get admin token in PUT /change-password beforeEach");
        });

        it('should allow admin to change their own password', async () => {
            const res = await request(app)
                .put('/api/admin/auth/change-password')
                .set('Authorization', `Bearer ${changePassAdminToken}`)
                .send({
                    currentPassword: changePassAdminCreds.password,
                    newPassword: newPassword,
                    confirmNewPassword: newPassword
                });
            expect(res.statusCode).toEqual(200);
            expect(res.body).toHaveProperty('message', 'Password changed successfully.');

            const loginWithNewPassRes = await request(app)
                .post('/api/admin/auth/login')
                .send({ username: changePassAdminCreds.username, password: newPassword });
            expect(loginWithNewPassRes.statusCode).toEqual(200);
        });

        it('should not change password with incorrect current password', async () => {
            const res = await request(app)
                .put('/api/admin/auth/change-password')
                .set('Authorization', `Bearer ${changePassAdminToken}`)
                .send({
                    currentPassword: 'wrongOldPassword',
                    newPassword: newPassword,
                    confirmNewPassword: newPassword
                });
            expect(res.statusCode).toEqual(401);
            expect(res.body).toHaveProperty('message', 'Incorrect current password.');
        });

        it('should return validation error if new passwords do not match', async () => {
             const res = await request(app)
                .put('/api/admin/auth/change-password')
                .set('Authorization', `Bearer ${changePassAdminToken}`)
                .send({
                    currentPassword: changePassAdminCreds.password,
                    newPassword: newPassword,
                    confirmNewPassword: 'doesNotMatchNewPassword'
                });
            expect(res.statusCode).toEqual(400);
            expect(res.body).toHaveProperty('errors');
            expect(res.body.errors.some(e => e.path === 'confirmNewPassword')).toBe(true);
        });
    });

    describe('POST /api/admin/auth/logout', () => {
        let logoutAdminToken;
        const logoutAdminCreds = { username: 'logoutUser_auth', password: 'password123' };

        beforeEach(async () => {
            await mongoose.connection.collection('adminusers').deleteMany({username: logoutAdminCreds.username});
            await createAdmin({
                username: logoutAdminCreds.username,
                password: logoutAdminCreds.password
            });
            const loginRes = await request(app).post('/api/admin/auth/login').send(logoutAdminCreds);
            expect(loginRes.statusCode).toBe(200);
            logoutAdminToken = loginRes.body.token;
            if (!logoutAdminToken) throw new Error("Failed to get admin token in POST /logout beforeEach");
        });

        it('should return success message for logout', async () => {
            const res = await request(app)
                .post('/api/admin/auth/logout')
                .set('Authorization', `Bearer ${logoutAdminToken}`);
            expect(res.statusCode).toEqual(200);
            expect(res.body).toHaveProperty('message', 'Admin logged out successfully. Please clear your token.');
        });
    });
});