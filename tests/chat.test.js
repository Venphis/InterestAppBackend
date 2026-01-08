const request = require('supertest');
const app = require('../server');
const mongoose = require('mongoose');
const Chat = require('../models/Chat');
const User = require('../models/User');
const { createVerifiedUser, generateUserToken, createChat, createMessage } = require('./helpers/factories');

describe('Chat API', () => {
    let user1, user2, user3;
    let token1;

    beforeAll(async () => {
        await mongoose.connection.collection('users').deleteMany({});
        await mongoose.connection.collection('chats').deleteMany({});
        
        user1 = await createVerifiedUser({ username: 'user1' });
        user2 = await createVerifiedUser({ username: 'user2' });
        user3 = await createVerifiedUser({ username: 'user3' });
        token1 = generateUserToken(user1);
    });

    beforeEach(async () => {
        await Chat.deleteMany({});
    });

    describe('POST /api/chats', () => {
        it('should create new chat', async () => {
            const res = await request(app)
                .post('/api/chats')
                .set('Authorization', `Bearer ${token1}`)
                .send({ userId: user2._id });

            expect(res.statusCode).toBe(200);
            expect(res.body.participants).toHaveLength(2);
            expect(await Chat.countDocuments()).toBe(1);
        });

        it('should return existing chat', async () => {
            const chat = await createChat([user1, user2]);
            
            const res = await request(app)
                .post('/api/chats')
                .set('Authorization', `Bearer ${token1}`)
                .send({ userId: user2._id });

            expect(res.statusCode).toBe(200);
            expect(res.body._id).toBe(chat._id.toString());
            expect(await Chat.countDocuments()).toBe(1);
        });

        it('should prevent self-chat', async () => {
            const res = await request(app)
                .post('/api/chats')
                .set('Authorization', `Bearer ${token1}`)
                .send({ userId: user1._id });

            expect(res.statusCode).toBe(400);
        });

        it('should validate recipient', async () => {
            const res = await request(app)
                .post('/api/chats')
                .set('Authorization', `Bearer ${token1}`)
                .send({ userId: new mongoose.Types.ObjectId() });

            expect(res.statusCode).toBe(404);
        });
    });

    describe('GET /api/chats', () => {
        it('should list user chats', async () => {
            await createChat([user1, user2]);
            await createChat([user1, user3]);

            const res = await request(app)
                .get('/api/chats')
                .set('Authorization', `Bearer ${token1}`);

            expect(res.statusCode).toBe(200);
            expect(res.body).toHaveLength(2);
        });

        it('should filter out chats with deleted users', async () => {
            const deletedUser = await createVerifiedUser({ isDeleted: true });
            await createChat([user1, deletedUser]);

            const res = await request(app)
                .get('/api/chats')
                .set('Authorization', `Bearer ${token1}`);

            expect(res.statusCode).toBe(200);
            expect(res.body).toHaveLength(0);
        });
    });

    describe('Message History with Deleted Users', () => {
        it('should still show messages from deleted users', async () => {
            const deletedUser = await createVerifiedUser({ isDeleted: true });
            const chat = await createChat([user1, deletedUser]);
            
            await createMessage({
                chatId: chat._id,
                senderId: deletedUser._id,
                content: 'Message from deleted user'
            });

            const res = await request(app)
                .get(`/api/messages/${chat._id}`)
                .set('Authorization', `Bearer ${token1}`);

            expect(res.statusCode).toBe(200);
            expect(res.body.messages).toHaveLength(1);
            expect(res.body.messages[0].senderId).toBe(deletedUser._id.toString());
        });
    });
});