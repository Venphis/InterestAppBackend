// tests/adminAuth.test.js
const request = require('supertest');
const app = require('../server'); // Upewnij się, że server.js eksportuje `app`
const AdminUser = require('../models/AdminUser');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose'); // Potrzebny do new mongoose.Types.ObjectId()
// bcrypt może być potrzebny, jeśli będziesz ręcznie sprawdzał hashowane hasła,
// ale dla testów logowania polegamy na metodzie comparePassword modelu
// const bcrypt = require('bcrypt');

// Globalne beforeEach z jest.setup.js czyści wszystkie kolekcje,
// więc nie musimy tu robić AdminUser.deleteMany({}) w każdym beforeEach,
// chyba że chcemy być absolutnie pewni izolacji dla tego konkretnego pliku.
// Dla tego pliku, będziemy tworzyć admina w każdym odpowiednim bloku/teście.

describe('Admin Auth API', () => {
    const baseAdminCredentials = {
        username: 'testsuperadmin',
        password: 'superStrongPassword123!', // Hasło używane do tworzenia i logowania
    };

    // --- Testy dla POST /api/admin/auth/login ---
    describe('POST /api/admin/auth/login', () => {
        // Przed każdym testem logowania, stwórz świeżego admina, aby testy były niezależne
        beforeEach(async () => {
            await AdminUser.deleteMany({}); // Dodatkowe czyszczenie specyficznie dla adminów
            await AdminUser.create({
                username: baseAdminCredentials.username,
                password: baseAdminCredentials.password, // Hook pre-save w modelu zahashuje
                role: 'superadmin',
                isActive: true
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
            const adminInDb = await AdminUser.findOne({ username: baseAdminCredentials.username });
            expect(res.body._id).toBe(adminInDb._id.toString());
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
                .send({ username: 'nonexistentadmin', password: 'password' });
            expect(res.statusCode).toEqual(401);
            expect(res.body.message).toMatch(/Invalid admin credentials or admin not found/i);
        });

        it('should not login an inactive admin', async () => {
            await AdminUser.updateOne({ username: baseAdminCredentials.username }, { isActive: false });
            const res = await request(app)
                .post('/api/admin/auth/login')
                .send(baseAdminCredentials);
            expect(res.statusCode).toEqual(403);
            expect(res.body).toHaveProperty('message', 'Admin account is inactive');
        });

        it('should return validation errors for missing credentials', async () => {
            const res = await request(app)
                .post('/api/admin/auth/login')
                .send({ username: baseAdminCredentials.username }); // Brak hasła
            expect(res.statusCode).toEqual(400);
            expect(res.body).toHaveProperty('errors');
            // Możesz dodać bardziej szczegółową asercję na temat błędu walidacji
            expect(res.body.errors.some(err => err.path === 'password')).toBe(true);
        });
    });

    // --- Testy dla GET /api/admin/auth/me (chroniona trasa) ---
    describe('GET /api/admin/auth/me', () => {
        let currentAdminToken;
        let currentAdminId;

        // Ten beforeEach jest dla testów, które POTRZEBUJĄ zalogowanego admina
        beforeEach(async () => {
            // Wyczyść i stwórz świeżego admina TYLKO jeśli poprzednie testy go modyfikowały
            // lub jeśli chcemy pełnej izolacji. Na razie zostawmy, jak jest.
            // Można by też pobrać ID z adminUserForTesting z beforeAll i użyć tych samych credentials.
            await AdminUser.deleteMany({ username: 'meAdminUser' }); // Czyść tylko tego konkretnego, jeśli inni są potrzebni
            const admin = await AdminUser.create({
                username: 'meAdminUser', password: 'mePassword123', role: 'admin', isActive: true
            });
            currentAdminId = admin._id.toString();

            const loginRes = await request(app)
                .post('/api/admin/auth/login')
                .send({ username: 'meAdminUser', password: 'mePassword123' });
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
        });

        // Ten test nie potrzebuje beforeEach z logowaniem, bo nie wysyła tokenu
        it('should not get profile without a token', async () => {
            const res = await request(app).get('/api/admin/auth/me');
            expect(res.statusCode).toEqual(401);
            expect(res.body).toHaveProperty('message', 'Not authorized, no admin token or malformed header');
        });

        it('should not get profile with a regular user token', async () => {
            // ... (generowanie userTestToken z type: 'user' i podpisany JWT_ADMIN_SECRET) ...
            // Aby ten test miał sens i testował `decoded.type !== 'admin'`,
            // userTestToken musi być podpisany tym samym sekretem, co tokeny admina.
            const adminSecretToSignWith = process.env.JWT_ADMIN_SECRET || process.env.JWT_SECRET;
            if (!adminSecretToSignWith) throw new Error("Admin secret for signing user-typed token is undefined");

            const userTestToken = jwt.sign({ id: new mongoose.Types.ObjectId().toString(), type: 'user' }, adminSecretToSignWith);

            const res = await request(app)
                .get('/api/admin/auth/me')
                .set('Authorization', `Bearer ${userTestToken}`);
            expect(res.statusCode).toEqual(401);
            expect(res.body.message).toBe('token is not an admin token'); // Teraz powinno to przejść
        });
    });


    // --- Testy dla PUT /api/admin/auth/change-password (chroniona trasa) ---
    describe('PUT /api/admin/auth/change-password', () => {
        let changePassAdminToken;
        const changePassAdminCreds = { username: 'changepw', password: 'oldPassword123' };
        const newPassword = 'newSuperStrongPassword456!';

        beforeEach(async () => {
            await AdminUser.deleteMany({});
            await AdminUser.create({ ...changePassAdminCreds, role: 'admin', isActive: true });
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

            // Sprawdź, czy można zalogować się nowym hasłem
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

    // --- Testy dla POST /api/admin/auth/logout (chroniona trasa) ---
    describe('POST /api/admin/auth/logout', () => {
        let logoutAdminToken;
        const logoutAdminCreds = { username: 'logoutUser', password: 'password123' };

        beforeEach(async () => {
            await AdminUser.deleteMany({});
            await AdminUser.create({ ...logoutAdminCreds, role: 'admin', isActive: true });
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
            // Dalsze testy wymagałyby blacklistowania tokenów
        });
    });
});