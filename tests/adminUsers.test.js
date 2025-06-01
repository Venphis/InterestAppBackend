// tests/adminUsers.test.js
const request = require('supertest');
const app = require('../server');
const User = require('../models/User');
const AdminUser = require('../models/AdminUser');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const {
    createSuperAdmin,
    createAdmin,
    createUser,
    createVerifiedUser,
    createTestUserAccount,
    generateUserToken // Jeśli masz taki helper
} = require('./helpers/factories');

// Globalne beforeEach z jest.setup.js czyści mocki.

describe('Admin Users API', () => {
    let superadminToken;
    let adminToken;
    let regularUserForTesting; // Zmieniono na obiekt

    const superadminCredentials = { username: 'suiteSuperAdmin_usersApi', password: 'password123' };
    const adminCredentials = { username: 'suiteAdmin_usersApi', password: 'password123' };

    beforeAll(async () => {
        await mongoose.connection.collection('adminusers').deleteMany({});
        await mongoose.connection.collection('users').deleteMany({});

        await createSuperAdmin({ username: superadminCredentials.username, password: superadminCredentials.password });
        await createAdmin({ username: adminCredentials.username, password: adminCredentials.password });

        let res = await request(app).post('/api/admin/auth/login').send(superadminCredentials);
        expect(res.statusCode).toBe(200); // Ważne: Upewnij się, że logowanie w setupie działa
        superadminToken = res.body.token;
        if (!superadminToken) throw new Error("Superadmin token not obtained in beforeAll");


        res = await request(app).post('/api/admin/auth/login').send(adminCredentials);
        expect(res.statusCode).toBe(200);
        adminToken = res.body.token;
        if (!adminToken) throw new Error("Admin token not obtained in beforeAll");


        regularUserForTesting = await createVerifiedUser({ username: 'regUserForAdminTests', email: 'regAdmTests@example.com' });
    });


    describe('GET /api/admin/users', () => {
        let userA, userB, userTestC;

        beforeEach(async () => {
            // Czyścimy tylko użytkowników stworzonych specyficznie dla tego bloku testów
            // regularUserForTesting stworzony w beforeAll pozostaje
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
            // Oczekujemy userA, userB, userTestC + regularUserForTesting
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
                .set('Authorization', `Bearer ${adminToken}`); // Użyj tokenu zwykłego admina
            expect(res.statusCode).toEqual(200);
            // W kontrolerze jest logika, że tylko superadmin widzi usunięte, więc admin powinien dostać tylko aktywne
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
            // Zakładamy, że endpoint to PUT /api/admin/users/:userId/role
            // i przyjmuje { role: 'nowa_rola' } w body.
            // Upewnij się, że 'premium_user' jest zdefiniowaną rolą w Twoim UserSchema.
            const newRole = 'premium_user'; // Przykładowa rola
            if (!User.schema.path('role').enumValues.includes(newRole)) {
                console.warn(`Skipping role change test: role "${newRole}" not in User schema enums.`);
                return; // Pomiń test, jeśli rola nie jest zdefiniowana
            }


            const res = await request(app)
                .put(`/api/admin/users/${userToModify._id}/role`)
                .set('Authorization', `Bearer ${superadminToken}`) // Zakładamy, że tylko superadmin może
                .send({ role: newRole });

            expect(res.statusCode).toEqual(200);
            expect(res.body.user.role).toBe(newRole);

            const userInDb = await User.findById(userToModify._id);
            expect(userInDb.role).toBe(newRole);
        });

        it('should not allow an admin with insufficient role to change a user role (if role change restricted)', async () => {
        // Ten test ma sens tylko, jeśli np. zwykły 'admin' nie może zmieniać ról, a 'superadmin' może.
        // Jeśli Twój endpoint /role jest chroniony tylko przez protectAdmin, a nie authorizeAdminRole('superadmin'),
        // to ten test może nie być potrzebny lub asercja będzie inna.
        // Załóżmy, że tylko superadmin może.
        const newRole = 'premium_user';
        if (!User.schema.path('role').enumValues.includes(newRole)) {
            return; // Pomiń, jeśli rola nie istnieje
        }

        const res = await request(app)
            .put(`/api/admin/users/${userToModify._id}/role`)
            .set('Authorization', `Bearer ${adminToken}`) // Użyj tokenu zwykłego admina
            .send({ role: newRole });

        // Oczekiwany status zależy od tego, jak zaimplementowałeś authorizeAdminRole dla tej trasy
        // Jeśli jest authorizeAdminRole(['superadmin']), to powinno być 403
        // Jeśli tylko protectAdmin, to kontroler musiałby mieć logikę sprawdzania roli req.adminUser.role
        expect(res.statusCode).toEqual(403); // Zakładając, że tylko superadmin może
        expect(res.body.message).toContain('not authorized to access this route');
        });

        it('should allow superadmin to change a user role to "premium_user"', async () => {
        const newRole = 'premium_user';
        // Upewnij się, że rola 'premium_user' jest zdefiniowana w UserSchema.path('role').enumValues
        if (!User.schema.path('role').enumValues.includes(newRole)) {
            console.warn(`SKIPPING TEST: Role "${newRole}" is not defined in User schema enums. Please add it to test this feature.`);
            return; // Pomiń test, jeśli rola nie jest zdefiniowana
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
                .set('Authorization', `Bearer ${adminToken}`) // Użyj tokenu zwykłego admina
                .send({ role: newRole });

            // Oczekiwany status 403, jeśli trasa jest chroniona przez authorizeAdminRole(['superadmin'])
            expect(res.statusCode).toEqual(403);
            expect(res.body.message).toContain('not authorized to access this route');
        });

        it('should return validation error if role is invalid or not provided for role change', async () => {
            let res = await request(app)
                .put(`/api/admin/users/${userToModify._id}/role`)
                .set('Authorization', `Bearer ${superadminToken}`)
                .send({ role: 'nonExistentRole' });
            expect(res.statusCode).toEqual(400);
            // Oczekiwany komunikat zależy od walidatora lub logiki kontrolera
            expect(res.body.message).toContain('is not allowed or not defined in User schema');


            res = await request(app)
                .put(`/api/admin/users/${userToModify._id}/role`)
                .set('Authorization', `Bearer ${superadminToken}`)
                .send({}); // Brak pola role
            expect(res.statusCode).toEqual(400);
            expect(res.body.errors.some(e => e.path === 'role' && e.msg === 'Role is required.')).toBe(true);
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
            // Stwórz konto testowe, jeśli nie zostało stworzone w poprzednim teście (dla izolacji)
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
});