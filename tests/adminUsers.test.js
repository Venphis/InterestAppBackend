const request = require('supertest');
const app = require('../server');
const User = require('../models/User');
const AdminUser = require('../models/AdminUser');
const jwt = require('jsonwebtoken');
const AuditLog = require('../models/AuditLog');
const mongoose = require('mongoose');
const {
    createSuperAdmin,
    createAdmin,
    createUser,
    createVerifiedUser,
    createTestUserAccount,
    generateUserToken
} = require('./helpers/factories');

const superadminCreds = { username: 'rbac_superadmin', password: 'password123' };
const adminCreds = { username: 'rbac_admin', password: 'password123' };
const moderatorCreds = { username: 'rbac_moderator', password: 'password123' };

describe('Admin Users API', () => {
    let superadminToken, adminToken, moderatorToken; // Dodajemy moderatora
    let regularUserForTesting;
    let superadmin, admin; 

    const superadminCredentials = { username: 'rbac_superadmin', password: 'password123' };
    const adminCredentials = { username: 'rbac_admin', password: 'password123' };
    const moderatorCredentials = { username: 'rbac_moderator', password: 'password123' };

    beforeAll(async () => {
        await mongoose.connection.dropDatabase();
        // Stwórz wszystkie role
        [superadmin, admin, moderator] = await AdminUser.create([
            { ...superadminCredentials, role: 'superadmin', isActive: true },
            { ...adminCredentials, role: 'admin', isActive: true },
            { ...moderatorCredentials, role: 'moderator', isActive: true }
        ]);
        // Zaloguj wszystkich adminów
        let res = await request(app).post('/api/admin/auth/login').send(superadminCredentials);
        superadminToken = res.body.token;
        res = await request(app).post('/api/admin/auth/login').send(adminCredentials);
        adminToken = res.body.token;
        res = await request(app).post('/api/admin/auth/login').send(moderatorCredentials);
        moderatorToken = res.body.token;
        regularUserForTesting = await createVerifiedUser({ username: 'rbac_test_user_for_admin', email: 'rbac_for_admin@example.com' });
    });


    describe('GET /api/admin/users', () => {
        let userA, userB, userTestC;

        beforeEach(async () => {
            await User.deleteMany({
                email: { $in: ['a_getlist@example.com', 'b_getlist@example.com', 'c_test_getlist@example.com'] }
            });

            userA = await createUser({ username: 'userA_getlist', email: 'a_getlist@example.com', isEmailVerified: true });
            userB = await createUser({ username: 'userB_getlist', email: 'b_getlist@example.com', isEmailVerified: false, isBanned: true, banReason: 'spam' });
            userTestC = await createTestUserAccount({ username: 'userTestC_getlist', email: 'c_test_getlist@example.com' });
        });

        it('should get a list of users (superadmin)', async () => {
            const res = await request(app)
                .get('/api/admin/users')
                .set('Authorization', `Bearer ${superadminToken}`);
            expect(res.statusCode).toEqual(200);
            expect(res.body).toHaveProperty('users');
            expect(res.body.users.length).toBeGreaterThanOrEqual(4);
            expect(res.body.users.some(u => u._id === userA._id.toString())).toBe(true);
        });

        it('should filter users by isBanned (admin)', async () => {
            const res = await request(app)
                .get('/api/admin/users?isBanned=true')
                .set('Authorization', `Bearer ${adminToken}`);
            expect(res.statusCode).toEqual(200);
            expect(res.body.users.length).toBe(1);
            expect(res.body.users[0]._id).toBe(userB._id.toString());
        });

        it('should filter users by isTestAccount (admin)', async () => {
            const res = await request(app)
                .get('/api/admin/users?isTestAccount=true')
                .set('Authorization', `Bearer ${adminToken}`);
            expect(res.statusCode).toEqual(200);
            expect(res.body.users.length).toBe(1);
            expect(res.body.users[0]._id).toBe(userTestC._id.toString());
        });

         it('should allow superadmin to see soft-deleted users', async () => {
            await User.findByIdAndUpdate(userA._id, { isDeleted: true, deletedAt: new Date() });
            const res = await request(app)
                .get('/api/admin/users?showDeleted=true')
                .set('Authorization', `Bearer ${superadminToken}`);
            expect(res.statusCode).toEqual(200);
            expect(res.body.users.some(u => u._id === userA._id.toString() && u.isDeleted === true)).toBe(true);
        });

        it('should not allow non-superadmin to see soft-deleted users even if requested', async () => {
            await User.findByIdAndUpdate(userA._id, { isDeleted: true, deletedAt: new Date() });
            const res = await request(app)
                .get('/api/admin/users?showDeleted=true')
                .set('Authorization', `Bearer ${adminToken}`);
            expect(res.statusCode).toEqual(200);
            expect(res.body.users.every(u => u.isDeleted === false)).toBe(true);
        });
    });

    describe('User Actions by Admin', () => {
        let userToModify;

        beforeEach(async () => {
            await User.deleteMany({ email: 'modifyActionUser@example.com' });
            userToModify = await createVerifiedUser({ username: 'toModifyActionUser', email: 'modifyActionUser@example.com' });
        });

        it('should ban a user (superadmin)', async () => {
            const res = await request(app)
                .put(`/api/admin/users/${userToModify._id}/ban`)
                .set('Authorization', `Bearer ${superadminToken}`)
                .send({ banReason: 'Violation of terms for test' });
            expect(res.statusCode).toEqual(200);
            expect(res.body.message).toContain('banned successfully');
            const userInDb = await User.findById(userToModify._id);
            expect(userInDb.isBanned).toBe(true);
            expect(userInDb.banReason).toBe('Violation of terms for test');
        });

        it('should unban a user (admin)', async () => {
            await User.findByIdAndUpdate(userToModify._id, { isBanned: true, banReason: 'Old ban' });
            const res = await request(app)
                .put(`/api/admin/users/${userToModify._id}/unban`)
                .set('Authorization', `Bearer ${adminToken}`);
            expect(res.statusCode).toEqual(200);
            const userInDb = await User.findById(userToModify._id);
            expect(userInDb.isBanned).toBe(false);
            expect(userInDb.banReason).toBeNull();
        });

        it('should soft delete a user (superadmin)', async () => {
            const res = await request(app)
                .delete(`/api/admin/users/${userToModify._id}`)
                .set('Authorization', `Bearer ${superadminToken}`);
            expect(res.statusCode).toEqual(200);
            const userInDb = await User.findById(userToModify._id);
            expect(userInDb.isDeleted).toBe(true);
            expect(userInDb.deletedAt).toBeInstanceOf(Date);
        });

         it('should restore a soft-deleted user (superadmin)', async () => {
            await User.findByIdAndUpdate(userToModify._id, { isDeleted: true, deletedAt: new Date() });
            const res = await request(app)
                .put(`/api/admin/users/${userToModify._id}/restore`)
                .set('Authorization', `Bearer ${superadminToken}`);
            expect(res.statusCode).toEqual(200);
            const userInDb = await User.findById(userToModify._id);
            expect(userInDb.isDeleted).toBe(false);
            expect(userInDb.deletedAt).toBeNull();
        });

        it('should manually verify a user email (admin)', async () => {
            await User.findByIdAndUpdate(userToModify._id, { isEmailVerified: false });
            const res = await request(app)
                .put(`/api/admin/users/${userToModify._id}/verify-email`)
                .set('Authorization', `Bearer ${adminToken}`);
            expect(res.statusCode).toEqual(200);
            const userInDb = await User.findById(userToModify._id);
            expect(userInDb.isEmailVerified).toBe(true);
        });

        it('should allow superadmin to change a user role', async () => {
            const newRole = 'premium_user'; 
            if (!User.schema.path('role').enumValues.includes(newRole)) {
                console.warn(`Skipping role change test: role "${newRole}" not in User schema enums.`);
                return;
            }


            const res = await request(app)
                .put(`/api/admin/users/${userToModify._id}/role`)
                .set('Authorization', `Bearer ${superadminToken}`)
                .send({ role: newRole });

            expect(res.statusCode).toEqual(200);
            expect(res.body.user.role).toBe(newRole);

            const userInDb = await User.findById(userToModify._id);
            expect(userInDb.role).toBe(newRole);
        });

        it('should not allow an admin with insufficient role to change a user role (if role change restricted)', async () => {
        const newRole = 'premium_user';
        if (!User.schema.path('role').enumValues.includes(newRole)) {
            return; 
        }

        const res = await request(app)
            .put(`/api/admin/users/${userToModify._id}/role`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ role: newRole });
        expect(res.statusCode).toEqual(403);
        expect(res.body.message).toContain('not authorized to access this route');
        });

        it('should allow superadmin to change a user role to "premium_user"', async () => {
        const newRole = 'premium_user';
        if (!User.schema.path('role').enumValues.includes(newRole)) {
            console.warn(`SKIPPING TEST: Role "${newRole}" is not defined in User schema enums. Please add it to test this feature.`);
            return;
        }

        const res = await request(app)
            .put(`/api/admin/users/${userToModify._id}/role`)
            .set('Authorization', `Bearer ${superadminToken}`)
            .send({ role: newRole });

        expect(res.statusCode).toEqual(200);
        expect(res.body.user).toBeDefined();
        expect(res.body.user.role).toBe(newRole);

        const userInDb = await User.findById(userToModify._id);
        expect(userInDb.role).toBe(newRole);
        });

        it('should not allow an admin with "admin" role to change a user role (if restricted to superadmin)', async () => {
            const newRole = 'premium_user';
            if (!User.schema.path('role').enumValues.includes(newRole)) {
                return; 
            }

            const res = await request(app)
                .put(`/api/admin/users/${userToModify._id}/role`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ role: newRole });
            expect(res.statusCode).toEqual(403);
            expect(res.body.message).toContain('not authorized to access this route');
        });

        it('should return validation error if role is invalid or not provided for role change', async () => {
            let res = await request(app)
                .put(`/api/admin/users/${userToModify._id}/role`)
                .set('Authorization', `Bearer ${superadminToken}`)
                .send({ role: 'nonExistentRole' });
            expect(res.statusCode).toEqual(400);
            expect(res.body.message).toContain('is not allowed or not defined in User schema');


            res = await request(app)
                .put(`/api/admin/users/${userToModify._id}/role`)
                .set('Authorization', `Bearer ${superadminToken}`)
                .send({});
            expect(res.statusCode).toEqual(400);
            expect(res.body.errors.some(e => e.path === 'role' && e.msg === 'Role is required.')).toBe(true);
        });

        it('should ban a user (superadmin) and create an audit log entry', async () => {
        const initialLogCount = await AuditLog.countDocuments();
        const res = await request(app)
            .put(`/api/admin/users/${userToModify._id}/ban`)
            .set('Authorization', `Bearer ${superadminToken}`)
            .send({ banReason: 'Violation of terms' });

        expect(res.statusCode).toEqual(200);

        // Asercja dla Audit Log
        const finalLogCount = await AuditLog.countDocuments();
        expect(finalLogCount).toBe(initialLogCount + 1);

        const logEntry = await AuditLog.findOne({ action: 'admin_banned_user' }).sort({ timestamp: -1 });
        expect(logEntry).not.toBeNull();
        expect(logEntry.actorId.toString()).toBe(superadmin._id.toString()); // superadmin jest zdefiniowany w beforeAll
        expect(logEntry.targetId.toString()).toBe(userToModify._id.toString());
        expect(logEntry.details.banReason).toBe('Violation of terms');
    });

    });

    describe('Test Account Management by Admin', () => {
        const testAccCredentials = { username: 'newTestAccByAdminAPI', email: 'newtestadminapi@example.com', password: 'password123' };
        let createdTestAccountId;

        beforeEach(async () => {
            await User.deleteMany({ email: testAccCredentials.email });
        });

        it('should create a test user (admin)', async () => {
            const res = await request(app)
                .post('/api/admin/users/create-test')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(testAccCredentials);
            expect(res.statusCode).toEqual(201);
            expect(res.body.user).toHaveProperty('isTestAccount', true);
            expect(res.body.user).toHaveProperty('isEmailVerified', true);
            createdTestAccountId = res.body.user._id;
        });

        it('should generate a JWT for an existing test user (admin)', async () => {
            const testUser = await createTestUserAccount({
                username: 'genTokenTestUserApi', email: 'gentokentestapi@example.com'
            });
            createdTestAccountId = testUser._id.toString();

            const res = await request(app)
                .post(`/api/admin/users/${createdTestAccountId}/generate-test-token`)
                .set('Authorization', `Bearer ${adminToken}`);
            expect(res.statusCode).toEqual(200);
            expect(res.body).toHaveProperty('token');
            expect(res.body.userId).toBe(createdTestAccountId);

            const decoded = jwt.verify(res.body.token, process.env.JWT_SECRET);
            expect(decoded.id).toBe(createdTestAccountId);
        });

        it('should not generate token for a non-test account', async () => {
            const res = await request(app)
                .post(`/api/admin/users/${regularUserForTesting._id}/generate-test-token`)
                .set('Authorization', `Bearer ${adminToken}`);
            expect(res.statusCode).toEqual(400);
            expect(res.body.message).toContain('not a designated test account');
        });
    });

    describe('RBAC - Role-Based Access Control', () => {
        let userToModify;

        beforeEach(async () => {
            userToModify = await createVerifiedUser({ username: 'rbac_target_user', email: 'rbac_target@example.com' });
        });

        it('should NOT allow a regular admin to soft delete a user', async () => {
            const res = await request(app)
                .delete(`/api/admin/users/${userToModify._id}`)
                .set('Authorization', `Bearer ${adminToken}`); // Użyj tokenu admina

            expect(res.statusCode).toEqual(403); // Oczekujemy Forbidden
            expect(res.body.message).toContain('not authorized to access this route');
        });

        it('should NOT allow a moderator to soft delete a user', async () => {
            const res = await request(app)
                .delete(`/api/admin/users/${userToModify._id}`)
                .set('Authorization', `Bearer ${moderatorToken}`); // Użyj tokenu moderatora

            expect(res.statusCode).toEqual(403);
        });

        it('should NOT allow a regular admin to restore a soft-deleted user', async () => {
            await User.findByIdAndUpdate(userToModify._id, { isDeleted: true, deletedAt: new Date() });
            const res = await request(app)
                .put(`/api/admin/users/${userToModify._id}/restore`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.statusCode).toEqual(403);
        });

        // Testy dla zmiany roli (jeśli masz ten endpoint)
        it('should NOT allow a regular admin to change a user role', async () => {
            const res = await request(app)
                .put(`/api/admin/users/${userToModify._id}/role`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ role: 'premium_user' });
            expect(res.statusCode).toEqual(403);
        });
    });

});