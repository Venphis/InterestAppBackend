// tests/errorHandler.test.js
const request = require('supertest');
const app = require('../server');
const User = require('../models/User');
const { createSuperAdmin } = require('./helpers/factories'); // Użyj fabryki do stworzenia admina
const mongoose = require('mongoose'); // Potrzebny do czyszczenia

describe('Global Error Handler', () => {
    let superadminToken; // Zmienna na token

    beforeAll(async () => {
        // Wyczyść kolekcje na początku, aby uniknąć konfliktów
        await mongoose.connection.collection('adminusers').deleteMany({});
        // Stwórz i zaloguj admina, aby uzyskać token do testowania chronionych tras
        const superadminCreds = { username: 'errorHandlerAdmin', password: 'password123' };
        await createSuperAdmin(superadminCreds);
        const res = await request(app).post('/api/admin/auth/login').send(superadminCreds);
        if (res.statusCode !== 200) {
            console.error("Login failed in errorHandler test setup:", res.body);
            throw new Error("Could not get superadmin token for error handler tests");
        }
        superadminToken = res.body.token;
    });


    it('should handle 404 Not Found errors and return a JSON response', async () => {
        const res = await request(app)
            .get('/api/this-route-does-not-exist-at-all');

        expect(res.statusCode).toEqual(404);
        expect(res.body).toHaveProperty('message');
        expect(res.body.message).toContain('Not Found - /api/this-route-does-not-exist-at-all');
    });

    it('should return 500 if the database query in a controller fails', async () => {
    const findError = new Error('Simulated Database connection lost');

    // Wycisz console.error na czas tego testu
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    jest.spyOn(User, 'find').mockImplementation(() => {
        throw findError;
    });

    const res = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${superadminToken}`);

    expect(res.statusCode).toEqual(500);
    // Dostosuj tę asercję w zależności od tego, którą opcję wybrałeś
    // Jeśli kontroler przekazuje oryginalny komunikat:
    expect(res.body).toHaveProperty('message', 'Server Error fetching users');
    // Jeśli kontroler wysyła generyczny komunikat:
    // expect(res.body).toHaveProperty('message', 'Server Error fetching users');

    // Przywróć oryginalne implementacje
    consoleErrorSpy.mockRestore(); // Przywróć console.error
    jest.restoreAllMocks();
    });
});