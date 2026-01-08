const request = require('supertest');
const app = require('../server');
const mongoose = require('mongoose');
const Friendship = require('../models/Friendship');
const User = require('../models/User');
const { createVerifiedUser, generateUserToken, createFriendship } = require('./helpers/factories');

describe('Friendship API', () => {
    let user1, user2, user3;
    let token1, token2;

    beforeAll(async () => {
        await mongoose.connection.collection('users').deleteMany({});
        user1 = await createVerifiedUser({ username: 'u1' });
        user2 = await createVerifiedUser({ username: 'u2' });
        user3 = await createVerifiedUser({ username: 'u3' });
        
        token1 = generateUserToken(user1);
        token2 = generateUserToken(user2);
    });

    beforeEach(async () => {
        await Friendship.deleteMany({});
    });

    describe('POST /api/friendships/request', () => {
        it('should send friend request', async () => {
            const res = await request(app)
                .post('/api/friendships/request')
                .set('Authorization', `Bearer ${token1}`)
                .send({ recipientId: user2._id });

            expect(res.statusCode).toBe(201);
            expect(res.body.friendship.status).toBe('pending');
            expect(await Friendship.countDocuments()).toBe(1);
        });

        it('should prevent self-request', async () => {
            const res = await request(app)
                .post('/api/friendships/request')
                .set('Authorization', `Bearer ${token1}`)
                .send({ recipientId: user1._id });

            expect(res.statusCode).toBe(400);
        });

        it('should prevent duplicate request', async () => {
            await createFriendship({ user1: user1, user2: user2, requestedBy: user1 });
            
            const res = await request(app)
                .post('/api/friendships/request')
                .set('Authorization', `Bearer ${token1}`)
                .send({ recipientId: user2._id });

            expect(res.statusCode).toBe(400);
        });

        it('should handle request to user who already requested you', async () => {
            await createFriendship({ user1: user2, user2: user1, requestedBy: user2 });
            
            const res = await request(app)
                .post('/api/friendships/request')
                .set('Authorization', `Bearer ${token1}`)
                .send({ recipientId: user2._id });

            expect(res.statusCode).toBe(400);
            expect(res.body.message).toMatch(/already received/i);
        });
    });

    describe('PUT /api/friendships/:id/accept', () => {
        it('should accept pending request', async () => {
            const friendship = await createFriendship({ user1: user1, user2: user2, requestedBy: user1 });
            
            const res = await request(app)
                .put(`/api/friendships/${friendship._id}/accept`)
                .set('Authorization', `Bearer ${token2}`);

            expect(res.statusCode).toBe(200);
            expect(res.body.friendship.status).toBe('accepted');
        });

        it('should prevent sender from accepting own request', async () => {
            const friendship = await createFriendship({ user1: user1, user2: user2, requestedBy: user1 });
            
            const res = await request(app)
                .put(`/api/friendships/${friendship._id}/accept`)
                .set('Authorization', `Bearer ${token1}`);

            expect(res.statusCode).toBe(400);
        });
    });

    describe('PUT /api/friendships/:id/reject', () => {
        it('should reject pending request', async () => {
            const friendship = await createFriendship({ user1: user1, user2: user2, requestedBy: user1 });
            
            const res = await request(app)
                .put(`/api/friendships/${friendship._id}/reject`)
                .set('Authorization', `Bearer ${token2}`);

            expect(res.statusCode).toBe(200);
            const dbFriendship = await Friendship.findById(friendship._id);
            expect(dbFriendship.status).toBe('rejected');
        });
    });

    describe('Friendship Management', () => {
        let friendship;

        beforeEach(async () => {
            friendship = await createFriendship({ 
                user1: user1, 
                user2: user2, 
                requestedBy: user1, 
                status: 'accepted' 
            });
        });

        it('should remove friendship', async () => {
            const res = await request(app)
                .delete(`/api/friendships/${friendship._id}`)
                .set('Authorization', `Bearer ${token1}`);

            expect(res.statusCode).toBe(200);
            expect(await Friendship.findById(friendship._id)).toBeNull();
        });

        it('should block user', async () => {
            const res = await request(app)
                .put(`/api/friendships/${friendship._id}/block`)
                .set('Authorization', `Bearer ${token1}`);

            expect(res.statusCode).toBe(200);
            const updated = await Friendship.findById(friendship._id);
            expect(updated.status).toBe('blocked');
            expect(updated.blockedBy).toEqual(user1._id);
        });

        it('should verify friendship', async () => {
            const res = await request(app)
                .put(`/api/friendships/${friendship._id}/verify`)
                .set('Authorization', `Bearer ${token1}`);

            expect(res.statusCode).toBe(200);
            expect(res.body.friendship.friendshipType).toBe('verified');
        });
    });

    describe('GET /api/friendships', () => {
        it('should list friends', async () => {
            await createFriendship({ user1: user1, user2: user2, status: 'accepted' });
            await createFriendship({ user1: user1, user2: user3, status: 'pending', requestedBy: user3 });

            const res = await request(app)
                .get('/api/friendships')
                .set('Authorization', `Bearer ${token1}`);

            expect(res.statusCode).toBe(200);
            expect(res.body).toHaveLength(2);
        });

        it('should exclude deleted users', async () => {
            const deletedUser = await createVerifiedUser();

            await User.findByIdAndUpdate(deletedUser._id, { isDeleted: true });
            await createFriendship({ user1: user1, user2: deletedUser, status: 'accepted' });

            const res = await request(app)
                .get('/api/friendships')
                .set('Authorization', `Bearer ${token1}`);

            expect(res.statusCode).toBe(200);
            expect(res.body).toHaveLength(0);
        });
    });
});