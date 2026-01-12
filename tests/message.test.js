const request = require('supertest');
const app = require('../server');
const mongoose = require('mongoose');
const sodium = require('libsodium-wrappers');
const Message = require('../models/Message');
const Chat = require('../models/Chat');
const User = require('../models/User');
const Friendship = require('../models/Friendship');
const { createVerifiedUser, generateUserToken, createChat, createMessage, createFriendship } = require('./helpers/factories');

// E2EE Helpers (Sodium)
const encrypt = (text, sender, receiver) => {
    const nonce = sodium.randombytes_buf(sodium.crypto_box_NONCEBYTES);
    const sharedKey = sodium.crypto_box_beforenm(receiver.publicKey, sender.privateKey);
    const ciphertext = sodium.crypto_box_easy_afternm(text, nonce, sharedKey);
    return JSON.stringify({ nonce: sodium.to_base64(nonce), ciphertext: sodium.to_base64(ciphertext) });
};

const decrypt = (payloadStr, receiver, sender) => {
    const payload = JSON.parse(payloadStr);
    const sharedKey = sodium.crypto_box_beforenm(sender.publicKey, receiver.privateKey);
    return sodium.crypto_box_open_easy_afternm(
        sodium.from_base64(payload.ciphertext),
        sodium.from_base64(payload.nonce),
        sharedKey,
        'text'
    );
};

describe('Message API (E2EE)', () => {
    let user1, user2, user3;
    let token1, token2, token3;
    let chat12;
    let keys1, keys2;

    beforeAll(async () => {
        await sodium.ready;
        await mongoose.connection.collection('users').deleteMany({});
        await mongoose.connection.collection('chats').deleteMany({});
        await mongoose.connection.collection('messages').deleteMany({});
        
        user1 = await createVerifiedUser({ username: 'u1' });
        user2 = await createVerifiedUser({ username: 'u2' });
        user3 = await createVerifiedUser({ username: 'u3' });
        
        token1 = generateUserToken(user1);
        token2 = generateUserToken(user2);
        token3 = generateUserToken(user3);

        keys1 = sodium.crypto_box_keypair();
        keys2 = sodium.crypto_box_keypair();

        await User.findByIdAndUpdate(user1._id, { publicKey: sodium.to_base64(keys1.publicKey) });
        await User.findByIdAndUpdate(user2._id, { publicKey: sodium.to_base64(keys2.publicKey) });
    });

    beforeEach(async () => {
        await Chat.deleteMany({});
        await Message.deleteMany({});
        await Friendship.deleteMany({});
        
        chat12 = await createChat([user1, user2]);
        await createFriendship({ user1, user2, status: 'accepted' });
    });

    describe('POST /api/messages', () => {
        it('should send encrypted message', async () => {
            const secret = 'Top Secret';
            const encrypted = encrypt(secret, keys1, keys2);

            const res = await request(app)
                .post('/api/messages')
                .set('Authorization', `Bearer ${token1}`)
                .send({ chatId: chat12._id, content: encrypted });

            expect(res.statusCode).toBe(200);
            
            const msg = await Message.findById(res.body._id);
            expect(decrypt(msg.content, keys2, keys1)).toBe(secret);
        });

        it('should update chat lastMessage', async () => {
            const encrypted = encrypt('ping', keys1, keys2);
            const res = await request(app)
                .post('/api/messages')
                .set('Authorization', `Bearer ${token1}`)
                .send({ chatId: chat12._id, content: encrypted });

            const chat = await Chat.findById(chat12._id);
            expect(chat.lastMessage.toString()).toBe(res.body._id);
        });

        it('should prevent sending to non-participant chat', async () => {
            const res = await request(app)
                .post('/api/messages')
                .set('Authorization', `Bearer ${token3}`)
                .send({ chatId: chat12._id, content: 'spy' });

            expect(res.statusCode).toBe(404);
        });

        it('should block message if friendship is blocked', async () => {
            await Friendship.updateOne({}, { isBlocked: true, blockedBy: user2._id });

            const res = await request(app)
                .post('/api/messages')
                .set('Authorization', `Bearer ${token1}`)
                .send({ chatId: chat12._id, content: 'blocked?' });

            expect(res.statusCode).toBe(403);
        });
    });

    describe('GET /api/messages/:chatId', () => {
        beforeEach(async () => {
            const content = encrypt('History', keys1, keys2);
            await createMessage({ chatId: chat12._id, senderId: user1._id, content });
        });

        it('should retrieve encrypted messages', async () => {
            const res = await request(app)
                .get(`/api/messages/${chat12._id}`)
                .set('Authorization', `Bearer ${token2}`);

            expect(res.statusCode).toBe(200);
            expect(res.body.messages).toHaveLength(1);
            expect(decrypt(res.body.messages[0].content, keys2, keys1)).toBe('History');
        });

        it('should paginate messages', async () => {
            await Message.deleteMany({});
            for (let i = 0; i < 15; i++) {
                await createMessage({ chatId: chat12._id, senderId: user1._id, content: `msg-${i}` });
            }

            const res = await request(app)
                .get(`/api/messages/${chat12._id}?limit=10`)
                .set('Authorization', `Bearer ${token2}`);

            expect(res.statusCode).toBe(200);
            expect(res.body.messages).toHaveLength(10);
            expect(res.body.totalMessages).toBe(15);
        });
    });

    describe('Key Rotation & History Wipe', () => {
        it('should wipe history on key rotation', async () => {
            await createMessage({ chatId: chat12._id, senderId: user1._id, content: 'pre-rotation' });
            
            // Rotate key for user1
            const newKeys = sodium.crypto_box_keypair();
            await request(app)
                .post('/api/keys/publish')
                .set('Authorization', `Bearer ${token1}`)
                .send({ publicKey: sodium.to_base64(newKeys.publicKey) });

            // Verify history wiped
            const res = await request(app)
                .get(`/api/messages/${chat12._id}`)
                .set('Authorization', `Bearer ${token2}`);

            expect(res.body.messages).toHaveLength(0);
        });
    });
});