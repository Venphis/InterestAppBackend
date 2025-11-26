// tests/adminAuditLog.test.js
const request = require('supertest');
const app = require('../server');
const AdminUser = require('../models/AdminUser');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const { createSuperAdmin, createAdmin, createVerifiedUser, generateUserToken } = require('./helpers/factories');
const mongoose = require('mongoose');

describe('Admin Audit Log API (/api/admin/audit-logs)', () => {
    let superadminToken, adminToken;
    let superadmin, admin, regularUser;

    beforeAll(async () => {
        // Czysty start dla tego pliku testowego
        await mongoose.connection.collection('adminusers').deleteMany({});
        await mongoose.connection.collection('users').deleteMany({});
        await mongoose.connection.collection('auditlogs').deleteMany({}); // <-- KLUCZOWE: CZYŚĆ LOGI

        // Stwórz aktorów
        superadmin = await createSuperAdmin({ username: 'auditSuperAdmin' });
        admin = await createAdmin({ username: 'auditAdmin' });
        regularUser = await createVerifiedUser({ username: 'auditUser' });

        // Zaloguj adminów - to stworzy 2 logi 'admin_login_success'
        let res = await request(app).post('/api/admin/auth/login').send({ username: 'auditSuperAdmin', password: 'superStrongPassword123!' });
        superadminToken = res.body.token;
        res = await request(app).post('/api/admin/auth/login').send({ username: 'auditAdmin', password: 'superStrongPassword123!' });
        adminToken = res.body.token;

        // Stwórz DOKŁADNIE 4 wpisy w AuditLog, aby testy były przewidywalne
        // (łącznie z 2 logami z logowania będzie 6 logów)
        await AuditLog.create([
            { level: 'info', actorType: 'user', actorId: regularUser._id, actorModelName: 'User', action: 'user_login_success' },
            { level: 'admin_action', actorType: 'admin', actorId: superadmin._id, actorModelName: 'AdminUser', action: 'admin_banned_user', targetType: 'user', targetId: regularUser._id },
            { level: 'admin_action', actorType: 'admin', actorId: admin._id, actorModelName: 'AdminUser', action: 'admin_updated_report', targetType: 'report' },
            { level: 'warn', actorType: 'system', action: 'user_login_failed' },
        ]);
    });

    // Teraz wszystkie testy poniżej powinny operować na 6 logach
    const TOTAL_LOGS = 6;

    describe('GET /api/admin/audit-logs', () => {
        it('should allow superadmin to get a list of all audit logs', async () => {
            const res = await request(app)
                .get('/api/admin/audit-logs')
                .set('Authorization', `Bearer ${superadminToken}`);

            expect(res.statusCode).toEqual(200);
            expect(res.body.logs.length).toBe(TOTAL_LOGS);
            expect(res.body.totalLogs).toBe(TOTAL_LOGS);
        });

        it('should allow a regular admin to get a list of all audit logs', async () => {
            const res = await request(app)
                .get('/api/admin/audit-logs')
                .set('Authorization', `Bearer ${adminToken}`);
            expect(res.statusCode).toEqual(200);
            expect(res.body.logs.length).toBe(TOTAL_LOGS);
        });

        it('should not allow a regular user to access audit logs', async () => {
            const userToken = generateUserToken(regularUser);
            const res = await request(app)
                .get('/api/admin/audit-logs')
                .set('Authorization', `Bearer ${userToken}`);
            expect(res.statusCode).toEqual(401); // Odrzucone przez protectAdmin
        });

        it('should filter logs by level', async () => {
            const res = await request(app)
                .get('/api/admin/audit-logs?level=admin_action')
                .set('Authorization', `Bearer ${superadminToken}`);
            expect(res.statusCode).toEqual(200);
            expect(res.body.logs.length).toBe(2);
            expect(res.body.logs.every(log => log.level === 'admin_action')).toBe(true);
        });

        it('should filter logs by action', async () => {
            const res = await request(app)
                .get('/api/admin/audit-logs?action=user_login_success')
                .set('Authorization', `Bearer ${superadminToken}`);
            expect(res.statusCode).toEqual(200);
            expect(res.body.logs.length).toBe(1);
            expect(res.body.logs[0].action).toBe('user_login_success');
        });

        it('should filter logs by actorId', async () => {
            // Superadmin ma teraz 2 logi: 'admin_login_success' i 'admin_banned_user'
            const res = await request(app)
                .get(`/api/admin/audit-logs?actorId=${superadmin._id}`)
                .set('Authorization', `Bearer ${superadminToken}`);

            expect(res.statusCode).toEqual(200);
            expect(res.body.logs.length).toBe(2); // Oczekujemy 2 logów dla tego superadmina
            // Sprawdź, czy każdy zwrócony log ma poprawne `actorId`
            // `actorId` w odpowiedzi jest populowany i jest obiektem, lub jest stringiem ID. Sprawdźmy, co zwraca API.
            // Jeśli jest obiektem:
            expect(res.body.logs.every(log => log.actorId && log.actorId._id.toString() === superadmin._id.toString())).toBe(true);
            // Jeśli jest stringiem ID:
            // expect(res.body.logs.every(log => log.actorId.toString() === superadmin._id.toString())).toBe(true);
        });

        it('should handle pagination correctly', async () => {
            const res = await request(app)
                .get('/api/admin/audit-logs?page=2&limit=3') // Pobierz stronę 2 z limitem 3
                .set('Authorization', `Bearer ${superadminToken}`);
            expect(res.statusCode).toEqual(200);
            expect(res.body.logs.length).toBe(3); // 6 logów / 3 na stronę = 2 strony, strona 2 ma 3 logi
            expect(res.body.currentPage).toBe(2);
            expect(res.body.totalPages).toBe(2); // 6 / 3 = 2
            expect(res.body.totalLogs).toBe(TOTAL_LOGS);
        });
    });
});