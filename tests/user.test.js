// tests/user.test.js
const request = require('supertest');
const app = require('../server');
const User = require('../models/User'); // Potrzebny do asercji na bazie
const Interest = require('../models/Interest'); // Dla przyszłych testów zainteresowań
const InterestCategory = require('../models/InterestCategory'); // Dla przyszłych testów zainteresowań
const UserInterest = require('../models/UserInterest'); // Dla przyszłych testów zainteresowań
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const path = require('path'); // Potrzebne do testowania wgrywania plików
const fs = require('fs');     // Potrzebne do testowania wgrywania plików
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

    beforeAll(async () => {
        await mongoose.connection.collection('users').deleteMany({});
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

// --- NOWE TESTY DLA ZAINTERESOWAŃ UŻYTKOWNIKA ---
describe('User API - Interests on Profile', () => {
    let testUser;
    let testUserToken;
    let techCategory, activeInterest, archivedInterest;

    beforeAll(async () => {
        // Czyścimy wszystko na początku tego bloku
        await mongoose.connection.collection('users').deleteMany({});
        await mongoose.connection.collection('interestcategories').deleteMany({});
        await mongoose.connection.collection('interests').deleteMany({});
        await mongoose.connection.collection('userinterests').deleteMany({});

        testUser = await createVerifiedUser({ username: 'interestTester_user', email: 'interest@user.com' });
        testUserToken = generateUserToken(testUser);

        techCategory = await createInterestCategory({ name: 'User Test Tech' });
        activeInterest = await createInterest({ name: 'Active Interest for User Test', category: techCategory });
        archivedInterest = await createInterest({ name: 'Archived Interest for User Test', category: techCategory, overrides: { isArchived: true } });
    });

    beforeEach(async () => {
        // Czyść tylko powiązania user-interest przed każdym testem
        await UserInterest.deleteMany({ userId: testUser._id });
    });

    it('should allow user to add an interest to their profile', async () => {
        const res = await request(app)
            .post('/api/users/profile/interests')
            .set('Authorization', `Bearer ${testUserToken}`)
            .send({ interestId: activeInterest._id.toString(), customDescription: 'I love this active interest!' });

        expect(res.statusCode).toEqual(201);
        // POPRAWKA ASERCJI
        expect(res.body).toHaveProperty('interestId');
        expect(res.body.interestId._id).toBe(activeInterest._id.toString());
        expect(res.body.customDescription).toBe('I love this active interest!');

        const userInterestsInDb = await UserInterest.find({ userId: testUser._id });
        expect(userInterestsInDb.length).toBe(1);
    });

    it('should prevent adding the same interest twice', async () => {
        // Najpierw dodaj raz
        await addUserInterestEntry({ userId: testUser, interestId: activeInterest });

        // Spróbuj dodać drugi raz
        const res = await request(app)
            .post('/api/users/profile/interests')
            .set('Authorization', `Bearer ${testUserToken}`)
            .send({ interestId: activeInterest._id.toString() });

        expect(res.statusCode).toEqual(400);
        expect(res.body.message).toContain('Interest already added to profile');
    });

    it('should prevent adding a non-existent interestId', async () => {
        const nonExistentId = new mongoose.Types.ObjectId().toString();
        const res = await request(app)
            .post('/api/users/profile/interests')
            .set('Authorization', `Bearer ${testUserToken}`)
            .send({ interestId: nonExistentId });
        expect(res.statusCode).toEqual(404);
        expect(res.body.message).toContain('Interest not found');
    });

    it('should prevent adding an archived interest', async () => {
        const res = await request(app)
            .post('/api/users/profile/interests')
            .set('Authorization', `Bearer ${testUserToken}`)
            .send({ interestId: archivedInterest._id.toString() });
        expect(res.statusCode).toEqual(400); // Zakładając, że kontroler zwraca 400
        expect(res.body.message).toContain('Cannot add an archived interest');
    });

    it('should allow user to update custom description for their interest', async () => {
        const userInterest = await addUserInterestEntry({ userId: testUser, interestId: activeInterest, overrides: { customDescription: 'Old description' } });
        const newDescription = 'This is the new updated description.';
        const res = await request(app)
            .put(`/api/users/profile/interests/${userInterest._id}`)
            .set('Authorization', `Bearer ${testUserToken}`)
            .send({ customDescription: newDescription });

        expect(res.statusCode).toEqual(200);
        expect(res.body.customDescription).toBe(newDescription);
        const userInterestInDb = await UserInterest.findById(userInterest._id);
        expect(userInterestInDb.customDescription).toBe(newDescription);
    });

    it('should allow user to remove an interest from their profile', async () => {
        const userInterest = await addUserInterestEntry({ userId: testUser, interestId: activeInterest });
        let userInterestsInDb = await UserInterest.find({ userId: testUser._id });
        expect(userInterestsInDb.length).toBe(1);

        const res = await request(app)
            .delete(`/api/users/profile/interests/${userInterest._id}`)
            .set('Authorization', `Bearer ${testUserToken}`);

        expect(res.statusCode).toEqual(200);
        expect(res.body.message).toContain('Interest removed successfully');
        userInterestsInDb = await UserInterest.find({ userId: testUser._id });
        expect(userInterestsInDb.length).toBe(0);
    });
});


// --- NOWE TESTY DLA WGRYWANIA AVATARA ---
describe('User API - Avatar Upload', () => {
    let testUser;
    let testUserToken;
    const avatarUploadPath = path.join(__dirname, '..', 'public', 'uploads', 'avatars'); // Ścieżka do folderu z avatarami

    beforeEach(async () => {
        await mongoose.connection.collection('users').deleteMany({ email: 'avatar@user.com' });
        testUser = await createVerifiedUser({ username: 'avatarTester', email: 'avatar@user.com' });
        testUserToken = generateUserToken(testUser);
        // Wyczyść folder z avatarami przed testami (ostrożnie w prawdziwym projekcie!)
        if (fs.existsSync(avatarUploadPath)) {
            fs.readdirSync(avatarUploadPath).forEach(file => fs.unlinkSync(path.join(avatarUploadPath, file)));
        }
    });

    it('should allow user to upload a valid avatar image (jpg)', async () => {
        const imagePath = path.join(__dirname, 'helpers', 'test-image.jpg'); // Potrzebujesz małego pliku jpg w folderze helpers
        // Stwórz plik test-image.jpg, jeśli go nie masz
        if (!fs.existsSync(imagePath)) {
            fs.writeFileSync(imagePath, 'fake image data');
        }

        const res = await request(app)
            .put('/api/users/profile/avatar')
            .set('Authorization', `Bearer ${testUserToken}`)
            .attach('avatarImage', imagePath); // 'avatarImage' to nazwa pola z trasy

        expect(res.statusCode).toEqual(200);
        expect(res.body).toHaveProperty('avatarUrl');
        expect(res.body.avatarUrl).toMatch(/\/public\/uploads\/avatars\//); // Sprawdź, czy URL jest poprawny

        const userInDb = await User.findById(testUser._id);
        expect(userInDb.profile.avatarUrl).toBe(res.body.avatarUrl);
        // Sprawdź, czy plik fizycznie istnieje na serwerze
        const uploadedFilePath = path.join(__dirname, '..', userInDb.profile.avatarUrl);
        expect(fs.existsSync(uploadedFilePath)).toBe(true);
    });

    it('should reject non-image files (e.g., txt)', async () => {
        const filePath = path.join(__dirname, 'helpers', 'test-file.txt');
        if (!fs.existsSync(filePath)) {
            fs.writeFileSync(filePath, 'this is not an image');
        }

        const res = await request(app)
            .put('/api/users/profile/avatar')
            .set('Authorization', `Bearer ${testUserToken}`)
            .attach('avatarImage', filePath);

        expect(res.statusCode).toEqual(400); // Multer fileFilter powinien zwrócić błąd
        expect(res.body.message).toBe('Not an image! Please upload only images.');
    });

    it('should reject files that are too large', async () => {
        const largeFilePath = path.join(__dirname, 'helpers', 'large-file.jpg');
        // Stwórz plik większy niż limit 2MB
        const largeBuffer = Buffer.alloc(1024 * 1024 * 6, 'a'); // 3MB
        fs.writeFileSync(largeFilePath, largeBuffer);

        const res = await request(app)
            .put('/api/users/profile/avatar')
            .set('Authorization', `Bearer ${testUserToken}`)
            .attach('avatarImage', largeFilePath);

        expect(res.statusCode).toEqual(400); // Multer limits powinien zwrócić błąd
        expect(res.body.message).toBe('File too large. Maximum size is 5MB.');
    });

    it('should delete the old avatar file if a new one is uploaded', async () => {
        const imagePath1 = path.join(__dirname, 'helpers', 'test-image1.jpg');
        const imagePath2 = path.join(__dirname, 'helpers', 'test-image2.jpg');
        if (!fs.existsSync(imagePath1)) fs.writeFileSync(imagePath1, 'img1');
        if (!fs.existsSync(imagePath2)) fs.writeFileSync(imagePath2, 'img2');

        // Wgraj pierwszy avatar
        const res1 = await request(app)
            .put('/api/users/profile/avatar')
            .set('Authorization', `Bearer ${testUserToken}`)
            .attach('avatarImage', imagePath1);
        expect(res1.statusCode).toEqual(200);
        const oldAvatarUrl = res1.body.avatarUrl;
        const oldAvatarFullPath = path.join(__dirname, '..', oldAvatarUrl);
        expect(fs.existsSync(oldAvatarFullPath)).toBe(true);

        // Wgraj drugi avatar
        const res2 = await request(app)
            .put('/api/users/profile/avatar')
            .set('Authorization', `Bearer ${testUserToken}`)
            .attach('avatarImage', imagePath2);
        expect(res2.statusCode).toEqual(200);
        const newAvatarUrl = res2.body.avatarUrl;
        const newAvatarFullPath = path.join(__dirname, '..', newAvatarUrl);
        expect(fs.existsSync(newAvatarFullPath)).toBe(true);

        // Sprawdź, czy stary plik został usunięty
        expect(fs.existsSync(oldAvatarFullPath)).toBe(false);
    });
});