const request = require('supertest');
const app = require('../server');
const User = require('../models/User');
const mongoose = require('mongoose');
const sodium = require('libsodium-wrappers'); 
const Message = require('../models/Message');
const { createVerifiedUser, generateUserToken, createChat } = require('./helpers/factories');

describe('Key Management API (/api/keys)', () => {
    let user1, user2;
    let token1, token2;
    let publicKey;

    beforeAll(async () => {
        await sodium.ready;
        await mongoose.connection.collection('users').deleteMany({});

        user1 = await createVerifiedUser({ username: 'u1' });
        user2 = await createVerifiedUser({ username: 'u2' });
        token1 = generateUserToken(user1);
        token2 = generateUserToken(user2);

        const keys = sodium.crypto_box_keypair();
        publicKey = sodium.to_base64(keys.publicKey);
    });

    beforeEach(async () => {
        await User.updateMany({}, { $unset: { publicKey: "" } });
    });

    describe('POST /api/keys/publish', () => {
        it('should publish new key', async () => {
            const res = await request(app)
                .post('/api/keys/publish')
                .set('Authorization', `Bearer ${token1}`)
                .send({ publicKey });

            expect(res.statusCode).toBe(200);
            expect(res.body.message).toMatch(/published/);
            
            const user = await User.findById(user1._id);
            expect(user.publicKey).toBe(publicKey);
        });

        it('should rotate key and wipe history', async () => {
            await User.findByIdAndUpdate(user1._id, { publicKey: 'old_key' });
            const chat = await createChat([user1, user2]);
            await Message.create({ chatId: chat._id, senderId: user1._id, content: 'secret' });

            const res = await request(app)
                .post('/api/keys/publish')
                .set('Authorization', `Bearer ${token1}`)
                .send({ publicKey });

            expect(res.statusCode).toBe(200);
            expect(res.body.message).toMatch(/wiped/);
            expect(await Message.countDocuments({ chatId: chat._id })).toBe(0);
        });

        it('should validate missing key', async () => {
            const res = await request(app)
                .post('/api/keys/publish')
                .set('Authorization', `Bearer ${token1}`)
                .send({});

            expect(res.statusCode).toBe(400);
        });
    });

    describe('GET /api/keys/:userId', () => {
        beforeEach(async () => {
            await User.findByIdAndUpdate(user1._id, { publicKey });
        });

        it('should fetch user public key', async () => {
            const res = await request(app)
                .get(`/api/keys/${user1._id}`)
                .set('Authorization', `Bearer ${token2}`);

            expect(res.statusCode).toBe(200);
            expect(res.body.publicKey).toBe(publicKey);
            expect(res.body.username).toBe(user1.username);
        });

        it('should return 404 if no key published', async () => {
            const res = await request(app)
                .get(`/api/keys/${user2._id}`)
                .set('Authorization', `Bearer ${token1}`);

            expect(res.statusCode).toBe(404);
        });

        it('should return 404 for invalid user', async () => {
            const res = await request(app)
                .get(`/api/keys/${new mongoose.Types.ObjectId()}`)
                .set('Authorization', `Bearer ${token1}`);

            expect(res.statusCode).toBe(404);
        });
    });
});