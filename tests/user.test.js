// tests/user.test.js
const request = require('supertest');
const app = require('../server');
const User = require('../models/User'); // Potrzebny do asercji na bazie
const Interest = require('../models/Interest'); // Dla przyszłych testów zainteresowań
const InterestCategory = require('../models/InterestCategory'); // Dla przyszłych testów zainteresowań
const UserInterest = require('../models/UserInterest'); // Dla przyszłych testów zainteresowań
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const {
    createUser,
    createVerifiedUser,
    generateUserToken,
    createInterestCategory, // Do testów zainteresowań
    createInterest,         // Do testów zainteresowań
    addUserInterestEntry    // Do testów zainteresowań
} = require('./helpers/factories');

// Globalne beforeEach z jest.setup.js czyści mocki.
// Czyszczenie kolekcji User będzie robione w odpowiednich beforeEach/beforeAll.

describe('User API - Profile', () => {
    let testUser;
    let testUserToken;
    const profileUserEmail = 'profile_user_for_suite@example.com';

    beforeEach(async () => {
        // Czyść użytkownika z tym emailem, aby zapewnić świeży stan dla każdego testu
        await mongoose.connection.collection('users').deleteMany({ email: profileUserEmail });
        testUser = await createVerifiedUser({
            username: 'profileUserSuite',
            email: profileUserEmail,
            password: 'password123'
        });
        testUserToken = generateUserToken(testUser);
    });

    it('should get user profile with valid token', async () => {
        const res = await request(app)
            .get('/api/users/profile')
            .set('Authorization', `Bearer ${testUserToken}`);

        expect(res.statusCode).toEqual(200);
        expect(res.body).toHaveProperty('_id', testUser._id.toString());
        expect(res.body.email).toBe(profileUserEmail);
    });

    it('should not get profile without token', async () => {
        const res = await request(app).get('/api/users/profile');
        expect(res.statusCode).toEqual(401);
        expect(res.body).toHaveProperty('message', 'Not authorized, no token or malformed header');
    });

    it('should update user profile (text data)', async () => {
        const profileUpdates = {
            profile: {
                displayName: 'Updated Profile Name by Test',
                location: 'New Test City',
                bio: 'This is an updated bio.'
            }
        };
        const res = await request(app)
            .put('/api/users/profile')
            .set('Authorization', `Bearer ${testUserToken}`)
            .send(profileUpdates);

        expect(res.statusCode).toEqual(200);
        expect(res.body.profile.displayName).toBe('Updated Profile Name by Test');
        expect(res.body.profile.location).toBe('New Test City');

        const userInDb = await User.findById(testUser._id);
        expect(userInDb.profile.bio).toBe('This is an updated bio.');
    });

    it('should return validation error for invalid profile update data', async () => {
        const profileUpdates = { profile: { displayName: 'A'.repeat(101) } }; // Za długa nazwa
         const res = await request(app)
            .put('/api/users/profile')
            .set('Authorization', `Bearer ${testUserToken}`)
            .send(profileUpdates);
        expect(res.statusCode).toEqual(400);
        expect(res.body).toHaveProperty('errors');
        expect(res.body.errors.some(e => e.path === 'profile.displayName')).toBe(true);
    });
});

describe('User API - Search', () => {
    let searcherUser;
    let searcherUserToken;

    beforeAll(async () => { // Stwórz użytkowników raz dla całego bloku Search
        await mongoose.connection.collection('users').deleteMany({}); // Wyczyść przed stworzeniem
        searcherUser = await createVerifiedUser({ username: 'searcherUserSuite', email: 'searcher_suite@example.com' });
        searcherUserToken = generateUserToken(searcherUser);

        await createUser({ username: 'searchTarget1', email: 'target1@example.com', isEmailVerified: true });
        await createUser({ username: 'anotherSearchTarget', email: 'target2@example.com', isEmailVerified: true });
        await createUser({ username: 'deletedSearchTarget', email: 'deletedtarget@example.com', isEmailVerified: true, isDeleted: true });
        await createUser({ username: 'bannedSearchTarget', email: 'bannedtarget@example.com', isEmailVerified: true, isBanned: true });
    });

    it('should find users by query (excluding self, deleted, and banned)', async () => {
        const res = await request(app)
            .get('/api/users/search?q=Target') // Powinno znaleźć 'searchTarget1' i 'anotherSearchTarget'
            .set('Authorization', `Bearer ${searcherUserToken}`);

        expect(res.statusCode).toEqual(200);
        expect(res.body).toBeInstanceOf(Array);
        expect(res.body.length).toBe(2);
        const foundUsernames = res.body.map(u => u.username);
        expect(foundUsernames).toContain('searchTarget1');
        expect(foundUsernames).toContain('anotherSearchTarget');
        expect(foundUsernames).not.toContain('deletedSearchTarget');
        expect(foundUsernames).not.toContain('bannedSearchTarget');
        expect(foundUsernames).not.toContain(searcherUser.username); // Nie powinien znaleźć samego siebie
    });

    it('should return empty array if no users match query', async () => {
        const res = await request(app)
            .get('/api/users/search?q=nonexistentuserqueryXYZ')
            .set('Authorization', `Bearer ${searcherUserToken}`);
        expect(res.statusCode).toEqual(200);
        expect(res.body).toEqual([]);
    });

    it('should require a search query "q" and return validation error', async () => {
        const res = await request(app)
            .get('/api/users/search') // Bez parametru q
            .set('Authorization', `Bearer ${searcherUserToken}`);
        expect(res.statusCode).toEqual(400);
        expect(res.body).toHaveProperty('errors');
        expect(res.body.errors.some(err => err.path === 'q')).toBe(true);
    });
});

// TODO: Dodaj describe blok dla testów /api/users/profile/avatar (wgrywanie plików)
// TODO: Dodaj describe blok dla testów /api/users/profile/interests (CRUD zainteresowań użytkownika)
//       Będzie wymagał stworzenia InterestCategory i Interest w setupie.

/* Przykład dla zainteresowań (do rozbudowy):
describe('User API - Interests', () => {
    let testUser;
    let testUserToken;
    let category1, interest1, interest2;

    beforeAll(async () => {
        await mongoose.connection.collection('users').deleteMany({});
        await mongoose.connection.collection('interestcategories').deleteMany({});
        await mongoose.connection.collection('interests').deleteMany({});
        await mongoose.connection.collection('userinterests').deleteMany({});

        testUser = await createVerifiedUser({ username: 'interestTester', email: 'interest@example.com' });
        testUserToken = generateUserToken(testUser);

        category1 = await createInterestCategory({ name: 'Tech' });
        interest1 = await createInterest({ name: 'Node.js', category: category1 });
        interest2 = await createInterest({ name: 'React', category: category1 });
    });

    it('should allow user to add an interest to their profile', async () => {
        const res = await request(app)
            .post('/api/users/profile/interests')
            .set('Authorization', `Bearer ${testUserToken}`)
            .send({ interestId: interest1._id.toString(), customDescription: 'Love backend dev' });

        expect(res.statusCode).toEqual(201);
        expect(res.body).toHaveProperty('interest');
        expect(res.body.interest._id).toBe(interest1._id.toString());
        expect(res.body.customDescription).toBe('Love backend dev');

        const userInterestsInDb = await UserInterest.find({ userId: testUser._id });
        expect(userInterestsInDb.length).toBe(1);
        expect(userInterestsInDb[0].interestId.toString()).toBe(interest1._id.toString());
    });

    // TODO: Testy dla aktualizacji opisu, usuwania zainteresowania, próby dodania tego samego, itp.
    // TODO: Test pobierania profilu użytkownika z populowanymi zainteresowaniami
});
*/