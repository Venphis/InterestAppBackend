const request = require('supertest');
const app = require('../server');
const User = require('../models/User');
const mongoose = require('mongoose');
const { createSuperAdmin } = require('./helpers/factories');

describe('Global Error Handling', () => {
    let superadminToken;

    beforeAll(async () => {
        await mongoose.connection.collection('adminusers').deleteMany({});
        
        const credentials = { username: 'errorAdmin', password: 'password123' };
        await createSuperAdmin(credentials);
        
        const res = await request(app).post('/api/admin/auth/login').send(credentials);
        superadminToken = res.body.token;
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('should return 404 for unknown routes', async () => {
        const res = await request(app).get('/api/non-existent-route');

        expect(res.statusCode).toBe(404);
        expect(res.body.message).toMatch(/Not Found/);
    });

    it('should catch unhandled errors and return 500', async () => {
        // Suppress expected error logs
        const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
        
        // Simulate DB crash
        jest.spyOn(User, 'find').mockImplementation(() => {
            throw new Error('Database disconnected');
        });

        const res = await request(app)
            .get('/api/admin/users')
            .set('Authorization', `Bearer ${superadminToken}`);

        expect(res.statusCode).toBe(500);
        expect(res.body.message).toBe('Database disconnected');
        
        spy.mockRestore();
    });
});