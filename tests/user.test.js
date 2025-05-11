// tests/user.test.js
const request = require('supertest');
const app = require('../server');
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

describe('User API - Profile', () => {
    let profileTestUserToken;
    let profileTestUserId;
    const profileTestUserEmail = 'profileuser_profile@example.com'; // Unikalny email dla tego bloku

    beforeEach(async () => {
        await User.deleteMany({});
        const user = await User.create({
            username: 'profiletestuser',
            email: profileTestUserEmail, // <-- UŻYJ POPRAWNEJ ZMIENNEJ
            password: 'password123',
            isEmailVerified: true,
            isBanned: false,
            isDeleted: false
        });
       profileTestUserId = user._id.toString();
if (!profileTestUserId || typeof profileTestUserId !== 'string' || profileTestUserId.length !== 24) { // Typowe ID MongoDB ma 24 znaki hex
    console.error('[user.test.js Profile beforeEach] CRITICAL: profileTestUserId is invalid before signing!');
}
profileTestUserToken = jwt.sign({ id: profileTestUserId }, process.env.JWT_SECRET, { expiresIn: '1h' });

try {
    const decodedPayload = jwt.decode(profileTestUserToken); // Tylko dekoduje, nie weryfikuje
    if (!decodedPayload || !decodedPayload.id) {
        console.error('[user.test.js Profile beforeEach] CRITICAL: Decoded payload is invalid or missing ID!');
    }
} catch (e) {
    console.error('[user.test.js Profile beforeEach] CRITICAL: Error decoding token in test:', e.message);
}
    });

    it('should get user profile with valid token', async () => {
        const res = await request(app)
            .get('/api/users/profile')
            .set('Authorization', `Bearer ${profileTestUserToken}`);

        expect(res.statusCode).toEqual(200);
        expect(res.body).toHaveProperty('_id', profileTestUserId);
        expect(res.body.email).toBe(profileTestUserEmail); // <-- UŻYJ POPRAWNEJ ZMIENNEJ
    });

    it('should not get profile without token', async () => {
        const res = await request(app).get('/api/users/profile');
        expect(res.statusCode).toEqual(401);
    });

    it('should update user profile (text data)', async () => {
        const profileUpdates = {
            profile: {
                displayName: 'Updated Profile Name',
                location: 'New Profile City'
            }
        };
        const res = await request(app)
            .put('/api/users/profile')
            .set('Authorization', `Bearer ${profileTestUserToken}`)
            .send(profileUpdates);

        expect(res.statusCode).toEqual(200);
        expect(res.body.profile.displayName).toBe('Updated Profile Name');

        const userInDb = await User.findById(profileTestUserId);
        expect(userInDb.profile.location).toBe('New Profile City');
    });

    it('should return validation error for invalid profile update data', async () => {
        const profileUpdates = { profile: { displayName: 'A'.repeat(101) } };
         const res = await request(app)
            .put('/api/users/profile')
            .set('Authorization', `Bearer ${profileTestUserToken}`)
            .send(profileUpdates);
        expect(res.statusCode).toEqual(400);
        expect(res.body).toHaveProperty('errors');
    });
});

describe('User API - Search', () => {
    let searchTestUserToken;
    let searchTestUserId;
    const searcherUserEmail = 'searcher@example.com'; // Email dla użytkownika wykonującego wyszukiwanie

    beforeEach(async () => {
        // Zakładamy, że globalne beforeEach w jest.setup.js czyści bazę
        // await User.deleteMany({}); // Można usunąć, jeśli jest.setup.js to robi
        const searcher = await User.create({
            username: 'searcheruser',
            email: searcherUserEmail, // <-- UŻYJ POPRAWNEJ ZMIENNEJ
            password: 'password123',
            isEmailVerified: true, isBanned: false, isDeleted: false
        });
        searchTestUserId = searcher._id.toString();
        if (!process.env.JWT_SECRET) {
            throw new Error("JWT_SECRET is undefined in user.test.js beforeEach for Search tests!");
        }
        searchTestUserToken = jwt.sign({ id: searchTestUserId }, process.env.JWT_SECRET, { expiresIn: '1h' });

        await User.create([
            { username: 'searchUser1', email: 'search1@example.com', password: 'password', isEmailVerified: true, isBanned: false, isDeleted: false },
            { username: 'anotherUserToFind', email: 'search2@example.com', password: 'password', isEmailVerified: true, isBanned: false, isDeleted: false },
            { username: 'searchUserHidden', email: 'hidden@example.com', password: 'password', isEmailVerified: true, isBanned: false, isDeleted: true },
        ]);
    });

    it('should find users by query', async () => {
        const res = await request(app)
            .get('/api/users/search?q=searchUser')
            .set('Authorization', `Bearer ${searchTestUserToken}`);

        expect(res.statusCode).toEqual(200);
        expect(res.body).toBeInstanceOf(Array);
        expect(res.body.length).toBe(1);
        expect(res.body[0].username).toBe('searchUser1');
    });

    it('should return empty array if no users match query', async () => {
        const res = await request(app)
            .get('/api/users/search?q=nonexistentuserquery')
            .set('Authorization', `Bearer ${searchTestUserToken}`);
        expect(res.statusCode).toEqual(200);
        expect(res.body).toEqual([]);
    });

    it('should require a search query "q" and return validation error', async () => {
        const res = await request(app)
            .get('/api/users/search')
            .set('Authorization', `Bearer ${searchTestUserToken}`);
        expect(res.statusCode).toEqual(400);
        expect(res.body).toHaveProperty('errors');
        // expect(res.body.errors[0].param).toBe('q'); // Poprawka: Jest to teraz 'path' a nie 'param' dla query params w express-validator v7+
        // Lub bardziej ogólnie:
        expect(res.body.errors.some(err => err.path === 'q')).toBe(true);
    });
});