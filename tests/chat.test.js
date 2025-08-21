// tests/chat.test.js
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
        // Wyczyść kolekcje na początku
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
        // Czyść czaty i wiadomości przed każdym testem, użytkownicy pozostają
        await mongoose.connection.collection('chats').deleteMany({});
        await mongoose.connection.collection('messages').deleteMany({});
    });

    describe('POST /api/chats (Create/Access Chat)', () => {
        it('should create a new chat between two users if one does not exist', async () => {
            const res = await request(app)
                .post('/api/chats')
                .set('Authorization', `Bearer ${tokenOne}`)
                .send({ userId: userTwo._id.toString() });

            expect(res.statusCode).toEqual(200); // Kontroler zwraca 200 zarówno przy tworzeniu, jak i dostępie
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
            expect(finalChatCount).toBe(initialChatCount); // Upewnij się, że nie stworzono nowego czatu
        });

        it('should not allow creating a chat with oneself', async () => {
            const res = await request(app)
                .post('/api/chats')
                .set('Authorization', `Bearer ${tokenOne}`)
                .send({ userId: userOne._id.toString() });

            // Zakładając, że masz logikę/walidację w kontrolerze
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
            expect(res.statusCode).toEqual(404); // Bo findOne({ isDeleted: false }) nie znajdzie
        });

        it('should not create a chat with a banned user', async () => {
            const bannedUser = await createVerifiedUser({ username: 'bannedChatUser', email: 'bannedchat@example.com', isBanned: true });
            const res = await request(app)
                .post('/api/chats')
                .set('Authorization', `Bearer ${tokenOne}`)
                .send({ userId: bannedUser._id.toString() });
            expect(res.statusCode).toEqual(404); // Bo findOne({ isBanned: false }) nie znajdzie
        });
    });

    describe('GET /api/chats (Fetch Chats)', () => {
        let chatOneTwo, chatOneThree, lastMessage;

        beforeEach(async () => {
            // Stwórz dwa czaty dla userOne
            chatOneTwo = await createChat([userOne, userTwo]);
            chatOneThree = await createChat([userOne, userThree]);

            // Dodaj wiadomość do jednego z czatów, aby przetestować populację i sortowanie
            lastMessage = await createMessage({ chatId: chatOneTwo, senderId: userTwo, content: 'This is the last message' });
            // Zaktualizuj chat, aby miał referencję do ostatniej wiadomości
            await Chat.findByIdAndUpdate(chatOneTwo._id, { lastMessage: lastMessage._id, lastMessageTimestamp: lastMessage.createdAt });
            // Drugi czat (OneThree) jest starszy, bo nie ma wiadomości
        });

        it('should fetch all chats for the logged-in user, sorted by last message timestamp', async () => {
            const res = await request(app)
                .get('/api/chats')
                .set('Authorization', `Bearer ${tokenOne}`);

            expect(res.statusCode).toEqual(200);
            expect(res.body).toBeInstanceOf(Array);
            expect(res.body.length).toBe(2);
            // Pierwszy czat na liście powinien być tym z najnowszą wiadomością
            expect(res.body[0]._id.toString()).toBe(chatOneTwo._id.toString());
            expect(res.body[1]._id.toString()).toBe(chatOneThree._id.toString());
        });

        it('should correctly populate participants and the last message', async () => {
            const res = await request(app)
                .get('/api/chats')
                .set('Authorization', `Bearer ${tokenOne}`);

            const firstChat = res.body[0]; // chatOneTwo
            expect(firstChat.participants[0]).toHaveProperty('username'); // Sprawdź, czy obiekty są populowane, a nie tylko ID
            expect(firstChat.participants[0]).not.toHaveProperty('password'); // Upewnij się, że hasło nie jest zwracane
            expect(firstChat).toHaveProperty('lastMessage');
            expect(firstChat.lastMessage._id.toString()).toBe(lastMessage._id.toString());
            expect(firstChat.lastMessage.content).toBe('This is the last message');
            expect(firstChat.lastMessage.senderId).toHaveProperty('username', userTwo.username); // Sprawdź, czy sender jest populowany
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