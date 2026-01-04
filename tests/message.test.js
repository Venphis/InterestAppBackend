// tests/message.test.js
const request = require('supertest');
const app = require('../server');
const User = require('../models/User');
const Chat = require('../models/Chat');
const Message = require('../models/Message');
const Friendship = require('../models/Friendship');
const { createVerifiedUser, generateUserToken, createChat, createMessage, createFriendship } = require('./helpers/factories');
const mongoose = require('mongoose');
const sodium = require('libsodium-wrappers');

// Helper: express-validator (v6/v7) may use `param` or `path`
const findFieldError = (resBody, field) => {
    const errors = resBody?.errors || [];
    return errors.find(e => (e.param || e.path) === field);
};

// Helper: E2EE “single ciphertext” using shared key (DH)
// Both sides can derive the same shared key with beforenm, so we store only ONE encrypted payload in DB.
const encryptSingleForChat = (plaintext, senderKeys, recipientKeys) => {
    const nonce = sodium.randombytes_buf(sodium.crypto_box_NONCEBYTES);
    const sharedKey = sodium.crypto_box_beforenm(recipientKeys.publicKey, senderKeys.privateKey); // DH shared key
    const ciphertext = sodium.crypto_box_easy_afternm(plaintext, nonce, sharedKey);

    return JSON.stringify({
        nonce: sodium.to_base64(nonce),
        ciphertext: sodium.to_base64(ciphertext),
    });
};

const decryptSingleForChat = (payloadString, selfKeys, otherPartyKeys) => {
    const payload = JSON.parse(payloadString);
    const sharedKey = sodium.crypto_box_beforenm(otherPartyKeys.publicKey, selfKeys.privateKey);
    return sodium.crypto_box_open_easy_afternm(
        sodium.from_base64(payload.ciphertext),
        sodium.from_base64(payload.nonce),
        sharedKey,
        'text'
    );
};

describe('Message API (/api/messages) with E2EE', () => {
    let userOne, userTwo, userThree;
    let tokenOne, tokenTwo, tokenThree;
    let chatOneTwo;
    let userOneKeys, userTwoKeys; // Uint8Array keypairs

    beforeAll(async () => {
        await sodium.ready;
        await mongoose.connection.collection('users').deleteMany({});
        await mongoose.connection.collection('chats').deleteMany({});
        await mongoose.connection.collection('messages').deleteMany({});
        await mongoose.connection.collection('friendships').deleteMany({});

        userOne = await createVerifiedUser({ username: 'e2eeUserOne', email: 'e2eeone@example.com' });
        userTwo = await createVerifiedUser({ username: 'e2eeUserTwo', email: 'e2eetwo@example.com' });
        userThree = await createVerifiedUser({ username: 'e2eeUserThree', email: 'e2eethree@example.com' });

        tokenOne = generateUserToken(userOne);
        tokenTwo = generateUserToken(userTwo);
        tokenThree = generateUserToken(userThree);

        // Generate DH keypairs (simulating phone keys)
        userOneKeys = sodium.crypto_box_keypair();
        userTwoKeys = sodium.crypto_box_keypair();

        // Publish public keys to DB (server stores public keys as base64 strings)
        await User.findByIdAndUpdate(userOne._id, { publicKey: sodium.to_base64(userOneKeys.publicKey) });
        await User.findByIdAndUpdate(userTwo._id, { publicKey: sodium.to_base64(userTwoKeys.publicKey) });
    });

    beforeEach(async () => {
        await mongoose.connection.collection('chats').deleteMany({});
        await mongoose.connection.collection('messages').deleteMany({});
        await mongoose.connection.collection('friendships').deleteMany({});
        chatOneTwo = await createChat([userOne, userTwo]);
        await createFriendship({ user1: userOne, user2: userTwo, requestedBy: userOne, status: 'accepted' });
    });

    describe('POST /api/messages with E2EE', () => {
        it('should allow a user to send a message encrypted for all participants', async () => {
            const originalMessage = 'This is a secret message for both of us!';

            // Client-side: encrypt ONCE using a shared key derivable by both participants
            const contentToSend = encryptSingleForChat(originalMessage, userOneKeys, userTwoKeys);

            const res = await request(app)
                .post('/api/messages')
                .set('Authorization', `Bearer ${tokenOne}`)
                .send({ chatId: chatOneTwo._id.toString(), content: contentToSend });

            expect(res.statusCode).toEqual(200);

            // DB stores `content` as String
            const messageInDb = await Message.findById(res.body._id);
            expect(typeof messageInDb.content).toBe('string');

            // Recipient can decrypt (userTwo)
            const decryptedByTwo = decryptSingleForChat(messageInDb.content, userTwoKeys, userOneKeys);
            expect(decryptedByTwo).toBe(originalMessage);

            // Sender can also decrypt (userOne) using the same ciphertext (shared secret)
            const decryptedByOne = decryptSingleForChat(messageInDb.content, userOneKeys, userTwoKeys);
            expect(decryptedByOne).toBe(originalMessage);
        });

        it('should correctly update the lastMessage and lastMessageTimestamp on the parent chat', async () => {
            const contentToSend = encryptSingleForChat('ping', userOneKeys, userTwoKeys);

            const res = await request(app)
                .post('/api/messages')
                .set('Authorization', `Bearer ${tokenOne}`)
                .send({ chatId: chatOneTwo._id.toString(), content: contentToSend });

            expect(res.statusCode).toEqual(200);

            const updatedChat = await Chat.findById(chatOneTwo._id);
            expect(updatedChat.lastMessage.toString()).toBe(res.body._id);
            expect(updatedChat.lastMessageTimestamp).toBeInstanceOf(Date);
        });

        it('should not allow sending a message to a chat they are not part of', async () => {
            const contentToSend = encryptSingleForChat('Should not send', userOneKeys, userTwoKeys);

            const res = await request(app)
                .post('/api/messages')
                .set('Authorization', `Bearer ${tokenThree}`)
                .send({ chatId: chatOneTwo._id.toString(), content: contentToSend });

            expect(res.statusCode).toEqual(404);
        });

        it('should return a validation error for invalid content format (not an object)', async () => {
            // Now: backend expects NON-EMPTY STRING, so an object is invalid
            const res = await request(app)
                .post('/api/messages')
                .set('Authorization', `Bearer ${tokenOne}`)
                .send({ chatId: chatOneTwo._id.toString(), content: { foo: 'bar' } });

            expect(res.statusCode).toEqual(400);
            expect(res.body).toHaveProperty('errors');
            expect(findFieldError(res.body, 'content')).toBeTruthy();
        });

        it('should return an error if content is missing an encrypted version for a participant', async () => {
            // New model: single ciphertext string -> “missing encrypted version” maps to “missing/empty content”
            const res = await request(app)
                .post('/api/messages')
                .set('Authorization', `Bearer ${tokenOne}`)
                .send({ chatId: chatOneTwo._id.toString(), content: '' });

            expect(res.statusCode).toEqual(400);
            expect(res.body).toHaveProperty('errors');
            expect(findFieldError(res.body, 'content')).toBeTruthy();
        });

        it('should not allow sending a message if the friendship with the recipient is blocked', async () => {
            await Friendship.updateOne(
                { $or: [{ user1: userOne._id, user2: userTwo._id }, { user1: userTwo._id, user2: userOne._id }] },
                { status: 'blocked', isBlocked: true, blockedBy: userOne._id }
            );

            const contentToSend = encryptSingleForChat('Blocked message attempt', userTwoKeys, userOneKeys);

            const res = await request(app)
                .post('/api/messages')
                .set('Authorization', `Bearer ${tokenTwo}`) // userTwo tries to send
                .send({ chatId: chatOneTwo._id.toString(), content: contentToSend });

            expect(res.statusCode).toEqual(403);
            expect(res.body.message).toContain('Cannot send message, user is blocked.');
        });
    });

    describe('GET /api/messages/:chatId', () => {
        beforeEach(async () => {
            await Message.deleteMany({});

            const originalMessage1 = 'Encrypted message 1';
            const content1 = encryptSingleForChat(originalMessage1, userOneKeys, userTwoKeys);

            // Create directly in DB for GET tests
            await createMessage({ chatId: chatOneTwo, senderId: userOne, content: content1 });
        });

        it('should fetch an encrypted message that can be decrypted by the recipient', async () => {
            const res = await request(app)
                .get(`/api/messages/${chatOneTwo._id}`)
                .set('Authorization', `Bearer ${tokenTwo}`);

            expect(res.statusCode).toEqual(200);
            expect(res.body).toHaveProperty('messages');
            expect(res.body.messages).toBeInstanceOf(Array);
            expect(res.body.messages.length).toBeGreaterThan(0);

            const message = res.body.messages[0];
            expect(typeof message.content).toBe('string');

            const decrypted = decryptSingleForChat(message.content, userTwoKeys, userOneKeys);
            expect(decrypted).toBe('Encrypted message 1');
        });

        it('should handle pagination for encrypted messages correctly', async () => {
            await Message.deleteMany({});

            for (let i = 1; i <= 25; i++) {
                const plaintext = `Paginated message ${i}`;
                const content = encryptSingleForChat(plaintext, userOneKeys, userTwoKeys);
                await createMessage({ chatId: chatOneTwo, senderId: userOne, content });
            }

            const res = await request(app)
                .get(`/api/messages/${chatOneTwo._id}?page=2&limit=10`)
                .set('Authorization', `Bearer ${tokenTwo}`);

            expect(res.statusCode).toEqual(200);
            expect(res.body.messages.length).toBe(10);
            expect(res.body.currentPage).toBe(2);
            expect(res.body.totalPages).toBe(3);

            // With your controller logic (sort desc, skip/limit, then reverse),
            // the first message on page 2 should be "Paginated message 6"
            const decryptedContent = decryptSingleForChat(res.body.messages[0].content, userTwoKeys, userOneKeys);
            expect(decryptedContent).toBe('Paginated message 6');
        });

        it('should not allow fetching messages for a chat if the user is not a participant', async () => {
            const res = await request(app)
                .get(`/api/messages/${chatOneTwo._id}`)
                .set('Authorization', `Bearer ${tokenThree}`);

            expect(res.statusCode).toEqual(403);
            expect(res.body.message).toContain('You are not authorized to view messages for this chat.');
        });
    });

    describe('Key Rotation Impact', () => {
        let rotationUserOne, rotationUserTwo;
        let rotationTokenOne, rotationTokenTwo;
        let rotationChat;
        let rotationUserOneKeys, rotationUserTwoKeys;

        beforeEach(async () => {
            await mongoose.connection.collection('users').deleteMany({});
            await mongoose.connection.collection('chats').deleteMany({});
            await mongoose.connection.collection('messages').deleteMany({});

            rotationUserOne = await createVerifiedUser({ username: 'rotUser1', email: 'rot1@ex.com' });
            rotationUserTwo = await createVerifiedUser({ username: 'rotUser2', email: 'rot2@ex.com' });

            rotationTokenOne = generateUserToken(rotationUserOne);
            rotationTokenTwo = generateUserToken(rotationUserTwo);

            // Initial keys
            rotationUserOneKeys = sodium.crypto_box_keypair();
            rotationUserTwoKeys = sodium.crypto_box_keypair();

            await User.findByIdAndUpdate(rotationUserOne._id, { publicKey: sodium.to_base64(rotationUserOneKeys.publicKey) });
            await User.findByIdAndUpdate(rotationUserTwo._id, { publicKey: sodium.to_base64(rotationUserTwoKeys.publicKey) });

            rotationChat = await createChat([rotationUserOne, rotationUserTwo]);

            const msg1 = encryptSingleForChat('Message 1 content', rotationUserOneKeys, rotationUserTwoKeys);
            const msg2 = encryptSingleForChat('Message 2 content', rotationUserTwoKeys, rotationUserOneKeys);

            await createMessage({ chatId: rotationChat, senderId: rotationUserOne, content: msg1 });
            await createMessage({ chatId: rotationChat, senderId: rotationUserTwo, content: msg2 });
        });

        it('should wipe history for the other user if one participant rotates their key', async () => {
            // 1. userTwo sees messages before rotation
            let res = await request(app)
                .get(`/api/messages/${rotationChat._id}`)
                .set('Authorization', `Bearer ${rotationTokenTwo}`);

            expect(res.statusCode).toEqual(200);
            expect(res.body.messages).toBeInstanceOf(Array);
            expect(res.body.messages.length).toBe(2);

            // 2. userOne rotates key
            const newKeys = sodium.crypto_box_keypair();
            const newPublicKey = sodium.to_base64(newKeys.publicKey);

            res = await request(app)
                .post('/api/keys/publish')
                .set('Authorization', `Bearer ${rotationTokenOne}`)
                .send({ publicKey: newPublicKey });

            expect(res.statusCode).toEqual(200);
            expect(res.body.message).toContain('Chat history cleared');

            // 3. userTwo should now have history wiped/unavailable
            res = await request(app)
                .get(`/api/messages/${rotationChat._id}`)
                .set('Authorization', `Bearer ${rotationTokenTwo}`);

            expect(res.statusCode).toEqual(200);
            expect(res.body.messages).toBeInstanceOf(Array);

            // Depending on implementation, you may either:
            // - return empty list, OR
            // - return a signal that history is unavailable due to key rotation.
            if (res.body.messages.length !== 0) {
                expect(res.body.historyUnavailableReason).toBe('key_rotation');
                expect(res.body.lastKeyRotationDate).toBeTruthy();
            } else {
                expect(res.body.messages.length).toBe(0);
            }
        });
    });
});
