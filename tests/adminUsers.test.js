const request = require('supertest');
const app = require('../server');
const mongoose = require('mongoose');
const User = require('../models/User');
const AdminUser = require('../models/AdminUser');
const AuditLog = require('../models/AuditLog');
const jwt = require('jsonwebtoken');
const {
    createSuperAdmin,
    createAdmin,
    createUser,
    createVerifiedUser,
    createTestUserAccount,
    createInterestCategory,
    createInterest,
    addUserInterestEntry
} = require('./helpers/factories');

describe('Admin Users API', () => {
    let superadminToken, adminToken, moderatorToken;
    let superadmin, admin, moderator;
    let regularUser;

    beforeAll(async () => {
        await mongoose.connection.dropDatabase();

        // Create Admins with Roles
        superadmin = await createSuperAdmin({ username: 'superadmin' });
        admin = await createAdmin({ username: 'admin' });
        moderator = await createAdmin({ username: 'moderator', role: 'moderator' });

        // Authenticate Admins
        const saRes = await request(app).post('/api/admin/auth/login').send({ username: 'superadmin', password: 'superStrongPassword123!' });
        superadminToken = saRes.body.token;

        const aRes = await request(app).post('/api/admin/auth/login').send({ username: 'admin', password: 'superStrongPassword123!' });
        adminToken = aRes.body.token;

        const mRes = await request(app).post('/api/admin/auth/login').send({ username: 'moderator', password: 'superStrongPassword123!' });
        moderatorToken = mRes.body.token;

        regularUser = await createVerifiedUser({ username: 'reg_user' });
    });

    describe('GET /api/admin/users', () => {
        beforeEach(async () => {
            await User.deleteMany({ email: { $in: ['banned@test.com', 'test@test.com'] } });
            await createUser({ username: 'banned_user', email: 'banned@test.com', isBanned: true });
            await createTestUserAccount({ username: 'test_acc', email: 'test@test.com' });
        });

        it('should list users for superadmin', async () => {
            const res = await request(app)
                .get('/api/admin/users')
                .set('Authorization', `Bearer ${superadminToken}`);
            
            expect(res.statusCode).toBe(200);
            expect(res.body.users.length).toBeGreaterThanOrEqual(3);
        });

        it('should filter by banned status', async () => {
            const res = await request(app)
                .get('/api/admin/users?isBanned=true')
                .set('Authorization', `Bearer ${adminToken}`);
            
            expect(res.statusCode).toBe(200);
            expect(res.body.users.length).toBe(1);
            expect(res.body.users[0].username).toBe('banned_user');
        });

        it('should filter by test account status', async () => {
            const res = await request(app)
                .get('/api/admin/users?isTestAccount=true')
                .set('Authorization', `Bearer ${adminToken}`);
            
            expect(res.statusCode).toBe(200);
            expect(res.body.users.length).toBe(1);
            expect(res.body.users[0].username).toBe('test_acc');
        });

        it('should allow superadmin to view deleted users', async () => {
            await User.findByIdAndUpdate(regularUser._id, { isDeleted: true });
            
            const res = await request(app)
                .get('/api/admin/users?showDeleted=true')
                .set('Authorization', `Bearer ${superadminToken}`);
            
            expect(res.statusCode).toBe(200);
            expect(res.body.users.some(u => u.isDeleted)).toBe(true);
        });
    });

    describe('User Actions (Ban/Unban)', () => {
        let targetUser;

        beforeEach(async () => {
            targetUser = await createVerifiedUser({ username: 'target_action' });
        });

        it('should ban user and log audit event', async () => {
            const res = await request(app)
                .put(`/api/admin/users/${targetUser._id}/ban`)
                .set('Authorization', `Bearer ${superadminToken}`)
                .send({ banReason: 'Spamming' });

            expect(res.statusCode).toBe(200);
            
            const user = await User.findById(targetUser._id);
            expect(user.isBanned).toBe(true);

            const log = await AuditLog.findOne({ action: 'admin_banned_user', targetId: targetUser._id });
            expect(log).toBeTruthy();
        });

        it('should unban user', async () => {
            await User.findByIdAndUpdate(targetUser._id, { isBanned: true });
            
            const res = await request(app)
                .put(`/api/admin/users/${targetUser._id}/unban`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.statusCode).toBe(200);
            const user = await User.findById(targetUser._id);
            expect(user.isBanned).toBe(false);
        });
    });

    describe('RBAC - Role Restrictions', () => {
        let targetUser;

        beforeEach(async () => {
            targetUser = await createVerifiedUser({ username: 'rbac_target' });
        });

        it('should prevent Admin from soft deleting user', async () => {
            const res = await request(app)
                .delete(`/api/admin/users/${targetUser._id}`)
                .set('Authorization', `Bearer ${adminToken}`);
            
            expect(res.statusCode).toBe(403);
        });

        it('should prevent Moderator from soft deleting user', async () => {
            const res = await request(app)
                .delete(`/api/admin/users/${targetUser._id}`)
                .set('Authorization', `Bearer ${moderatorToken}`);
            
            expect(res.statusCode).toBe(403);
        });

        it('should allow Superadmin to soft delete user', async () => {
            const res = await request(app)
                .delete(`/api/admin/users/${targetUser._id}`)
                .set('Authorization', `Bearer ${superadminToken}`);
            
            expect(res.statusCode).toBe(200);
            expect((await User.findById(targetUser._id)).isDeleted).toBe(true);
        });

        it('should prevent Admin from changing user role', async () => {
            const res = await request(app)
                .put(`/api/admin/users/${targetUser._id}/role`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ role: 'premium_user' });
            
            expect(res.statusCode).toBe(403);
        });
    });

    describe('User Interests View', () => {
        let targetUser;

        beforeEach(async () => {
            targetUser = await createVerifiedUser({ username: 'interest_user' });
            const cat = await createInterestCategory({ name: 'Tech' });
            const interest = await createInterest({ name: 'Coding', category: cat });
            await addUserInterestEntry({ userId: targetUser._id, interestId: interest._id });
        });

        it('should return user interests for admin', async () => {
            const res = await request(app)
                .get(`/api/admin/users/${targetUser._id}/interests`)
                .set('Authorization', `Bearer ${adminToken}`);
            
            expect(res.statusCode).toBe(200);
            expect(res.body).toHaveLength(1);
            expect(res.body[0].name).toBe('Coding');
        });
    });

    describe('Test Account Management', () => {
        it('should create test user', async () => {
            const res = await request(app)
                .post('/api/admin/users/create-test')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ username: 'test_user_api', email: 'test_api@test.com', password: 'password123' });
            
            expect(res.statusCode).toBe(201);
            expect(res.body.user.isTestAccount).toBe(true);
        });

        it('should generate token for test user', async () => {
            const testUser = await createTestUserAccount({ username: 'token_user' });
            
            const res = await request(app)
                .post(`/api/admin/users/${testUser._id}/generate-test-token`)
                .set('Authorization', `Bearer ${adminToken}`);
            
            expect(res.statusCode).toBe(200);
            const decoded = jwt.verify(res.body.token, process.env.JWT_SECRET);
            expect(decoded.id).toBe(testUser._id.toString());
        });
    });
});