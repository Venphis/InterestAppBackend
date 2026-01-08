const request = require('supertest');
const app = require('../server');
const mongoose = require('mongoose');
const AuditLog = require('../models/AuditLog');
const { createSuperAdmin, createAdmin, createVerifiedUser, generateUserToken, createAuditLog } = require('./helpers/factories');

describe('Admin Audit Log API (/api/admin/audit-logs)', () => {
    let superadminToken, adminToken;
    let superadmin, admin, regularUser;

    beforeAll(async () => {
        await mongoose.connection.collection('adminusers').deleteMany({});
        await mongoose.connection.collection('users').deleteMany({});
        await mongoose.connection.collection('auditlogs').deleteMany({});

        [superadmin, admin, regularUser] = await Promise.all([
            createSuperAdmin({ username: 'auditSuperAdmin' }),
            createAdmin({ username: 'auditAdmin' }),
            createVerifiedUser({ username: 'auditUser' })
        ]);

        const saLogin = await request(app).post('/api/admin/auth/login').send({ username: 'auditSuperAdmin', password: 'superStrongPassword123!' });
        superadminToken = saLogin.body.token;

        const aLogin = await request(app).post('/api/admin/auth/login').send({ username: 'auditAdmin', password: 'superStrongPassword123!' });
        adminToken = aLogin.body.token;

        await Promise.all([
            createAuditLog({ level: 'info', actorType: 'user', actorId: regularUser._id, actorModelName: 'User', action: 'user_login_success' }),
            createAuditLog({ level: 'admin_action', actorType: 'admin', actorId: superadmin._id, actorModelName: 'AdminUser', action: 'admin_banned_user', targetType: 'user', targetId: regularUser._id }),
            createAuditLog({ level: 'admin_action', actorType: 'admin', actorId: admin._id, actorModelName: 'AdminUser', action: 'admin_updated_report', targetType: 'report' }),
            createAuditLog({ level: 'warn', actorType: 'system', action: 'system_error' })
        ]);
    });

    // 2 logs from login + 4 manually created = 6
    const TOTAL_LOGS = 6;

    describe('GET /api/admin/audit-logs', () => {
        it('should allow Superadmin to retrieve all logs', async () => {
            const res = await request(app)
                .get('/api/admin/audit-logs')
                .set('Authorization', `Bearer ${superadminToken}`);

            expect(res.statusCode).toBe(200);
            expect(res.body.totalLogs).toBe(TOTAL_LOGS);
            expect(res.body.logs).toHaveLength(TOTAL_LOGS);
        });

        it('should allow Admin to retrieve all logs', async () => {
            const res = await request(app)
                .get('/api/admin/audit-logs')
                .set('Authorization', `Bearer ${adminToken}`);
            
            expect(res.statusCode).toBe(200);
            expect(res.body.logs).toHaveLength(TOTAL_LOGS);
        });

        it('should deny access to regular users', async () => {
            const userToken = generateUserToken(regularUser);
            const res = await request(app)
                .get('/api/admin/audit-logs')
                .set('Authorization', `Bearer ${userToken}`);
            
            expect(res.statusCode).toBe(401);
        });

        it('should filter logs by level', async () => {
            const res = await request(app)
                .get('/api/admin/audit-logs?level=admin_action')
                .set('Authorization', `Bearer ${superadminToken}`);

            expect(res.statusCode).toBe(200);
            expect(res.body.logs).toHaveLength(2);
            expect(res.body.logs[0].level).toBe('admin_action');
        });

        it('should filter logs by action', async () => {
            const res = await request(app)
                .get('/api/admin/audit-logs?action=user_login_success')
                .set('Authorization', `Bearer ${superadminToken}`);

            expect(res.statusCode).toBe(200);
            expect(res.body.logs).toHaveLength(1);
            expect(res.body.logs[0].action).toBe('user_login_success');
        });

        it('should filter logs by actorId', async () => {
            const res = await request(app)
                .get(`/api/admin/audit-logs?actorId=${superadmin._id}`)
                .set('Authorization', `Bearer ${superadminToken}`);

            expect(res.statusCode).toBe(200);
            expect(res.body.logs).toHaveLength(2);
            expect(res.body.logs[0].actorId._id).toBe(superadmin._id.toString());
        });

        it('should handle pagination correctly', async () => {
            const limit = 3;
            const res = await request(app)
                .get(`/api/admin/audit-logs?page=2&limit=${limit}`)
                .set('Authorization', `Bearer ${superadminToken}`);

            expect(res.statusCode).toBe(200);
            expect(res.body.logs).toHaveLength(3); 
            expect(res.body.currentPage).toBe(2);
            expect(res.body.totalPages).toBe(2);
            expect(res.body.totalLogs).toBe(TOTAL_LOGS);
        });
    });
});