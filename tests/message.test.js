const request = require('supertest');
const app = require('../server');
const User = require('../models/User');
const Chat = require('../models/Chat');
const Message = require('../models/Message');
const Friendship = require('../models/Friendship');
const { createVerifiedUser, generateUserToken, createChat, createMessage, createFriendship } = require('./helpers/factories');
const mongoose = require('mongoose');

describe('Message API (/api/messages)', () => {
    let userOne, userTwo, userThree;
    let tokenOne, tokenTwo, tokenThree;
    let chatOneTwo;

    beforeAll(async () => {
        await mongoose.connection.collection('users').deleteMany({});
        await mongoose.connection.collection('chats').deleteMany({});
        await mongoose.connection.collection('messages').deleteMany({});
        await mongoose.connection.collection('friendships').deleteMany({});


        userOne = await createVerifiedUser({ username: 'msgUserOne', email: 'msgone@example.com' });
        userTwo = await createVerifiedUser({ username: 'msgUserTwo', email: 'msgtwo@example.com' });
        userThree = await createVerifiedUser({ username: 'msgUserThree', email: 'msgthree@example.com' });

        tokenOne = generateUserToken(userOne);
        tokenTwo = generateUserToken(userTwo);
        tokenThree = generateUserToken(userThree);
    });

    beforeEach(async () => {
        await mongoose.connection.collection('chats').deleteMany({});
        await mongoose.connection.collection('messages').deleteMany({});
        await mongoose.connection.collection('friendships').deleteMany({});
        chatOneTwo = await createChat([userOne, userTwo]);
        await createFriendship({ user1: userOne, user2: userTwo, requestedBy: userOne, status: 'accepted' });
    });

    describe('POST /api/messages', () => {
        it('should allow a user to send a message to a chat they are part of', async () => {
            const messageData = {
                chatId: chatOneTwo._id.toString(),
                content: 'Hello, this is user one!'
            };
            const res = await request(app)
                .post('/api/messages')
                .set('Authorization', `Bearer ${tokenOne}`)
                .send(messageData);

            expect(res.statusCode).toEqual(200);
            expect(res.body).toHaveProperty('_id');
            expect(res.body.content).toBe(messageData.content);
            expect(res.body.senderId.username).toBe(userOne.username);
        });

        it('should correctly update the lastMessage and lastMessageTimestamp on the parent chat', async () => {
            const messageData = { chatId: chatOneTwo._id.toString(), content: 'This should be the last message' };
            const res = await request(app)
                .post('/api/messages')
                .set('Authorization', `Bearer ${tokenOne}`)
                .send(messageData);

            expect(res.statusCode).toEqual(200);
            const messageId = res.body._id;

            const updatedChat = await Chat.findById(chatOneTwo._id);
            expect(updatedChat.lastMessage.toString()).toBe(messageId);
            expect(new Date(updatedChat.lastMessageTimestamp).getTime()).toBeCloseTo(new Date(res.body.createdAt).getTime());
        });

        it('should not allow sending a message to a chat they are not part of', async () => {
            const messageData = { chatId: chatOneTwo._id.toString(), content: 'I should not be able to send this' };
            const res = await request(app)
                .post('/api/messages')
                .set('Authorization', `Bearer ${tokenThree}`) 
                .send(messageData);
            expect(res.statusCode).toEqual(404);
            expect(res.body.message).toContain("Chat not found or you are not a participant.");
        });

        it('should return a validation error for empty message content', async () => {
            const messageData = { chatId: chatOneTwo._id.toString(), content: '  ' };
            const res = await request(app)
                .post('/api/messages')
                .set('Authorization', `Bearer ${tokenOne}`)
                .send(messageData);
            expect(res.statusCode).toEqual(400);
            expect(res.body).toHaveProperty('errors');
            expect(res.body.errors[0].msg).toBe('Message content cannot be empty.');
        });

        it('should not allow sending a message if the friendship with the recipient is blocked', async () => {
            await Friendship.updateOne(
                { $or: [{ user1: userOne._id, user2: userTwo._id }, { user1: userTwo._id, user2: userOne._id }] },
                { status: 'blocked', isBlocked: true, blockedBy: userOne._id }
            );

            const messageData = { chatId: chatOneTwo._id.toString(), content: 'This message should be blocked' };
            const res = await request(app)
                .post('/api/messages')
                .set('Authorization', `Bearer ${tokenTwo}`)
                .send(messageData);

            expect(res.statusCode).toEqual(403);
            expect(res.body.message).toContain('Cannot send message, user is blocked.');
        });
    });

    describe('GET /api/messages/:chatId', () => {
        beforeEach(async () => {
        await Message.deleteMany({ chatId: chatOneTwo._id });
        for (let i = 1; i <= 25; i++) {
            await createMessage({
                chatId: chatOneTwo,
                senderId: i % 2 === 0 ? userTwo : userOne,
                content: `Message number ${i}`
            });
        }
    });

        it('should fetch the last page of messages by default, sorted chronologically', async () => {
        const res = await request(app)
            .get(`/api/messages/${chatOneTwo._id}`)
            .set('Authorization', `Bearer ${tokenOne}`);

        expect(res.statusCode).toEqual(200);
        expect(res.body).toHaveProperty('messages');
        expect(res.body.messages).toBeInstanceOf(Array);
        expect(res.body.messages.length).toBe(20);
        expect(res.body.messages[0].content).toBe('Message number 6');
        expect(res.body.messages[19].content).toBe('Message number 25');
        expect(res.body.currentPage).toBe(1);
        expect(res.body.totalPages).toBe(2);
        expect(res.body.totalMessages).toBe(25);
        });


        it('should handle pagination for messages correctly', async () => {
            const res = await request(app)
                .get(`/api/messages/${chatOneTwo._id}?page=2&limit=20`)
                .set('Authorization', `Bearer ${tokenOne}`);

            expect(res.statusCode).toEqual(200);
            expect(res.body.messages).toBeInstanceOf(Array);
            expect(res.body.messages.length).toBe(5); 
            expect(res.body.messages[0].content).toBe('Message number 1');
            expect(res.body.messages[4].content).toBe('Message number 5');
            expect(res.body.currentPage).toBe(2);
        });

        it('should not allow fetching messages for a chat if the user is not a participant', async () => {
            const res = await request(app)
                .get(`/api/messages/${chatOneTwo._id}`)
                .set('Authorization', `Bearer ${tokenThree}`); 
            expect(res.statusCode).toEqual(403);
            expect(res.body.message).toContain("You are not authorized to view messages for this chat.");
        });

    });
});