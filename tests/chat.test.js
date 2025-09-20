const request = require('supertest');
const app = require('../server');
const User = require('../models/User');
const Chat = require('../models/Chat');
const Message = require('../models/Message');
const { createVerifiedUser, generateUserToken, createChat, createMessage } = require('./helpers/factories');
const mongoose = require('mongoose');

describe('Chat API (/api/chats)', () => {
    let userOne, userTwo, userThree;
    let tokenOne, tokenTwo;

    beforeAll(async () => {
        await mongoose.connection.collection('users').deleteMany({});
        await mongoose.connection.collection('chats').deleteMany({});
        await mongoose.connection.collection('messages').deleteMany({});

        userOne = await createVerifiedUser({ username: 'chatUserOne', email: 'chatone@example.com' });
        userTwo = await createVerifiedUser({ username: 'chatUserTwo', email: 'chattwo@example.com' });
        userThree = await createVerifiedUser({ username: 'chatUserThree', email: 'chatthree@example.com' });

        tokenOne = generateUserToken(userOne);
        tokenTwo = generateUserToken(userTwo);
    });

    beforeEach(async () => {
        await mongoose.connection.collection('chats').deleteMany({});
        await mongoose.connection.collection('messages').deleteMany({});
    });

    describe('POST /api/chats (Create/Access Chat)', () => {
        it('should create a new chat between two users if one does not exist', async () => {
            const res = await request(app)
                .post('/api/chats')
                .set('Authorization', `Bearer ${tokenOne}`)
                .send({ userId: userTwo._id.toString() });

            expect(res.statusCode).toEqual(200);
            expect(res.body).toHaveProperty('_id');
            expect(res.body.participants).toBeInstanceOf(Array);
            expect(res.body.participants.length).toBe(2);
            const participantIds = res.body.participants.map(p => p._id.toString());
            expect(participantIds).toContain(userOne._id.toString());
            expect(participantIds).toContain(userTwo._id.toString());

            const chatInDb = await Chat.findById(res.body._id);
            expect(chatInDb).not.toBeNull();
        });

        it('should access an existing chat between two users and return it instead of creating a new one', async () => {
            const existingChat = await createChat([userOne, userTwo]);
            const initialChatCount = await Chat.countDocuments();

            const res = await request(app)
                .post('/api/chats')
                .set('Authorization', `Bearer ${tokenOne}`)
                .send({ userId: userTwo._id.toString() });

            expect(res.statusCode).toEqual(200);
            expect(res.body._id.toString()).toBe(existingChat._id.toString());
            const finalChatCount = await Chat.countDocuments();
            expect(finalChatCount).toBe(initialChatCount); 
        });

        it('should not allow creating a chat with oneself', async () => {
            const res = await request(app)
                .post('/api/chats')
                .set('Authorization', `Bearer ${tokenOne}`)
                .send({ userId: userOne._id.toString() });

            expect(res.statusCode).toEqual(400);
            expect(res.body.message).toContain('Cannot create a chat with yourself');
        });

        it('should not create a chat with a non-existent user', async () => {
            const nonExistentId = new mongoose.Types.ObjectId().toString();
            const res = await request(app)
                .post('/api/chats')
                .set('Authorization', `Bearer ${tokenOne}`)
                .send({ userId: nonExistentId });
            expect(res.statusCode).toEqual(404);
            expect(res.body.message).toContain('Recipient user not found');
        });

        it('should not create a chat with a soft-deleted user', async () => {
            const deletedUser = await createVerifiedUser({ username: 'deletedChatUser', email: 'deletedchat@example.com', isDeleted: true });
            const res = await request(app)
                .post('/api/chats')
                .set('Authorization', `Bearer ${tokenOne}`)
                .send({ userId: deletedUser._id.toString() });
            expect(res.statusCode).toEqual(404);
        });

        it('should not create a chat with a banned user', async () => {
            const bannedUser = await createVerifiedUser({ username: 'bannedChatUser', email: 'bannedchat@example.com', isBanned: true });
            const res = await request(app)
                .post('/api/chats')
                .set('Authorization', `Bearer ${tokenOne}`)
                .send({ userId: bannedUser._id.toString() });
            expect(res.statusCode).toEqual(404);
        });
    });

    describe('GET /api/chats (Fetch Chats)', () => {
        let chatOneTwo, chatOneThree, lastMessage;

        beforeEach(async () => {
            chatOneTwo = await createChat([userOne, userTwo]);
            chatOneThree = await createChat([userOne, userThree]);

            lastMessage = await createMessage({ chatId: chatOneTwo, senderId: userTwo, content: 'This is the last message' });
            await Chat.findByIdAndUpdate(chatOneTwo._id, { lastMessage: lastMessage._id, lastMessageTimestamp: lastMessage.createdAt });
        });

        it('should fetch all chats for the logged-in user, sorted by last message timestamp', async () => {
            const res = await request(app)
                .get('/api/chats')
                .set('Authorization', `Bearer ${tokenOne}`);

            expect(res.statusCode).toEqual(200);
            expect(res.body).toBeInstanceOf(Array);
            expect(res.body.length).toBe(2);
            expect(res.body[0]._id.toString()).toBe(chatOneTwo._id.toString());
            expect(res.body[1]._id.toString()).toBe(chatOneThree._id.toString());
        });

        it('should correctly populate participants and the last message', async () => {
            const res = await request(app)
                .get('/api/chats')
                .set('Authorization', `Bearer ${tokenOne}`);

            const firstChat = res.body[0];
            expect(firstChat.participants[0]).toHaveProperty('username'); 
            expect(firstChat.participants[0]).not.toHaveProperty('password');
            expect(firstChat.lastMessage._id.toString()).toBe(lastMessage._id.toString());
            expect(firstChat.lastMessage.content).toBe('This is the last message');
            expect(firstChat.lastMessage.senderId).toHaveProperty('username', userTwo.username);
        });

        it('should return an empty array if the user has no chats', async () => {
            const userWithNoChats = await createVerifiedUser({ username: 'noChatsUser', email: 'nochats@example.com' });
            const noChatsToken = generateUserToken(userWithNoChats);
            const res = await request(app)
                .get('/api/chats')
                .set('Authorization', `Bearer ${noChatsToken}`);
            expect(res.statusCode).toEqual(200);
            expect(res.body).toEqual([]);
        });
    });
});