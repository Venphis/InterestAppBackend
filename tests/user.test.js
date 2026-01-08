const request = require('supertest');
const app = require('../server');
const mongoose = require('mongoose');
const User = require('../models/User');
const UserInterest = require('../models/UserInterest');
const InterestCategory = require('../models/InterestCategory');
const Interest = require('../models/Interest');
const fs = require('fs');
const path = require('path');
const { createVerifiedUser, generateUserToken, createInterestCategory, createInterest, addUserInterestEntry } = require('./helpers/factories');

describe('User API', () => {
    let testUser, testUserToken;

    beforeAll(async () => {
        await mongoose.connection.collection('users').deleteMany({});
        await mongoose.connection.collection('interestcategories').deleteMany({});
        await mongoose.connection.collection('interests').deleteMany({});
        
        testUser = await createVerifiedUser({ username: 'mainUser', email: 'main@test.com' });
        testUserToken = generateUserToken(testUser);
    });

    describe('GET /api/users/profile', () => {
        it('should get current profile', async () => {
            const res = await request(app)
                .get('/api/users/profile')
                .set('Authorization', `Bearer ${testUserToken}`);

            expect(res.statusCode).toBe(200);
            expect(res.body._id).toBe(testUser._id.toString());
        });

        it('should reject unauthenticated request', async () => {
            const res = await request(app).get('/api/users/profile');
            expect(res.statusCode).toBe(401);
        });
    });

    describe('PUT /api/users/profile', () => {
        it('should update profile fields', async () => {
            const updates = { profile: { displayName: 'New Name', bio: 'New Bio' } };
            
            const res = await request(app)
                .put('/api/users/profile')
                .set('Authorization', `Bearer ${testUserToken}`)
                .send(updates);

            expect(res.statusCode).toBe(200);
            expect(res.body.profile.displayName).toBe('New Name');
            
            const user = await User.findById(testUser._id);
            expect(user.profile.bio).toBe('New Bio');
        });

        it('should validate inputs', async () => {
            const res = await request(app)
                .put('/api/users/profile')
                .set('Authorization', `Bearer ${testUserToken}`)
                .send({ profile: { displayName: 'A'.repeat(100) } });

            expect(res.statusCode).toBe(400);
        });
    });

    describe('GET /api/users/search', () => {
        let targetUser;

        beforeAll(async () => {
            targetUser = await createVerifiedUser({ username: 'targetUser', email: 'target@test.com' });
        });

        it('should search users by username', async () => {
            const res = await request(app)
                .get('/api/users/search?q=target')
                .set('Authorization', `Bearer ${testUserToken}`);

            expect(res.statusCode).toBe(200);
            expect(res.body).toHaveLength(1);
            expect(res.body[0].username).toBe('targetUser');
        });

        it('should exclude self from search', async () => {
            const res = await request(app)
                .get(`/api/users/search?q=${testUser.username}`)
                .set('Authorization', `Bearer ${testUserToken}`);

            expect(res.body).toHaveLength(0);
        });
    });

    describe('Interest Management', () => {
        let interest;

        beforeAll(async () => {
            const cat = await createInterestCategory({ name: 'Tech' });
            interest = await createInterest({ name: 'Coding', category: cat });
        });

        beforeEach(async () => {
            await UserInterest.deleteMany({ userId: testUser._id });
        });

        it('should add interest to profile', async () => {
            const res = await request(app)
                .post('/api/users/profile/interests')
                .set('Authorization', `Bearer ${testUserToken}`)
                .send({ interestId: interest._id });

            expect(res.statusCode).toBe(201);
            expect(await UserInterest.exists({ userId: testUser._id, interestId: interest._id })).toBeTruthy();
        });

        it('should prevent duplicate interests', async () => {
            await addUserInterestEntry({ userId: testUser._id, interestId: interest._id });
            
            const res = await request(app)
                .post('/api/users/profile/interests')
                .set('Authorization', `Bearer ${testUserToken}`)
                .send({ interestId: interest._id });

            expect(res.statusCode).toBe(400);
        });

        it('should update interest description', async () => {
            const entry = await addUserInterestEntry({ userId: testUser._id, interestId: interest._id });
            
            const res = await request(app)
                .put(`/api/users/profile/interests/${entry._id}`)
                .set('Authorization', `Bearer ${testUserToken}`)
                .send({ customDescription: 'Updated' });

            expect(res.statusCode).toBe(200);
            expect(res.body.customDescription).toBe('Updated');
        });

        it('should remove interest', async () => {
            const entry = await addUserInterestEntry({ userId: testUser._id, interestId: interest._id });
            
            const res = await request(app)
                .delete(`/api/users/profile/interests/${entry._id}`)
                .set('Authorization', `Bearer ${testUserToken}`);

            expect(res.statusCode).toBe(200);
            expect(await UserInterest.findById(entry._id)).toBeNull();
        });
    });

    describe('Avatar Upload', () => {
        const dummyPath = path.join(__dirname, 'temp.jpg');

        beforeAll(() => fs.writeFileSync(dummyPath, 'fake-image-content'));
        afterAll(() => { if(fs.existsSync(dummyPath)) fs.unlinkSync(dummyPath); });

        it('should upload avatar', async () => {
            const res = await request(app)
                .put('/api/users/profile/avatar')
                .set('Authorization', `Bearer ${testUserToken}`)
                .attach('avatarImage', dummyPath);

            expect(res.statusCode).toBe(200);
            expect(res.body.avatarUrl).toMatch(/\/uploads\/avatars\//);
            
            // Clean up uploaded file
            const uploadedPath = path.join(__dirname, '..', res.body.avatarUrl);
            if(fs.existsSync(uploadedPath)) fs.unlinkSync(uploadedPath);
        });

        it('should reject non-image file', async () => {
            const txtPath = path.join(__dirname, 'temp.txt');
            fs.writeFileSync(txtPath, 'text');
            
            const res = await request(app)
                .put('/api/users/profile/avatar')
                .set('Authorization', `Bearer ${testUserToken}`)
                .attach('avatarImage', txtPath);

            expect(res.statusCode).toBe(400);
            fs.unlinkSync(txtPath);
        });
    });

    describe('Account Deletion', () => {
        it('should soft delete account', async () => {
            const res = await request(app)
                .delete('/api/users/profile')
                .set('Authorization', `Bearer ${testUserToken}`);

            expect(res.statusCode).toBe(200);
            
            const user = await User.findById(testUser._id);
            expect(user.isDeleted).toBe(true);
        });

        it('should invalidate token after deletion', async () => {
            const res = await request(app)
                .get('/api/users/profile')
                .set('Authorization', `Bearer ${testUserToken}`);

            expect(res.statusCode).toBe(401);
        });
    });
});