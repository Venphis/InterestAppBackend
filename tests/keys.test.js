// tests/keys.test.js
const request = require('supertest');
const app = require('../server');
const User = require('../models/User');
const mongoose = require('mongoose');
const sodium = require('libsodium-wrappers'); 
const Message = require('../models/Message');
const Chat = require('../models/Chat');       
const {
    createVerifiedUser,
    generateUserToken,
    createChat 
} = require('./helpers/factories');

describe('Key Management API (/api/keys)', () => {
    let userOne, userTwo;
    let tokenOne, tokenTwo;
    let userOnePublicKey_base64; // Przechowamy wygenerowany klucz

    beforeAll(async () => {
        await sodium.ready; // Upewnij się, że libsodium jest gotowe

        // Czysty start
        await mongoose.connection.collection('users').deleteMany({});

        // Stwórz użytkowników
        userOne = await createVerifiedUser({ username: 'keyUserOne', email: 'keyone@example.com' });
        userTwo = await createVerifiedUser({ username: 'keyUserTwo', email: 'keytwo@example.com' });

        // Wygeneruj tokeny
        tokenOne = generateUserToken(userOne);
        tokenTwo = generateUserToken(userTwo);

        // Wygeneruj parę kluczy dla userOne do użycia w testach
        const userOneKeys = sodium.crypto_box_keypair();
        userOnePublicKey_base64 = sodium.to_base64(userOneKeys.publicKey);
    });

    // Czyść klucze publiczne z bazy przed każdym testem, aby zapewnić izolację
    beforeEach(async () => {
        await User.updateMany({}, { $unset: { publicKey: "" } });
    });

    describe('POST /api/keys/publish', () => {
        it('should allow a logged-in user to publish their public key for the first time', async () => {
            // Stwórz świeżego użytkownika bez klucza
            const freshUser = await createVerifiedUser();
            const freshToken = generateUserToken(freshUser);
            const keyPair = sodium.crypto_box_keypair();
            const publicKey = sodium.to_base64(keyPair.publicKey);

            const res = await request(app)
                .post('/api/keys/publish')
                .set('Authorization', `Bearer ${freshToken}`)
                .send({ publicKey });

            expect(res.statusCode).toEqual(200);
            // Teraz na pewno jest to pierwszy raz
            expect(res.body.message).toMatch(/Public key published successfully/);
        });

        it('should allow a user to update their existing public key and wipe chat history', async () => {
            // Najpierw ustaw stary klucz (symulacja stanu przed zmianą)
            await User.findByIdAndUpdate(userOne._id, { publicKey: 'old_key' });
            
            // Stwórz przykładowy czat i wiadomość, żeby sprawdzić czy znikną
            const chat = await createChat([userOne, userTwo]); // Załóżmy, że createChat jest zaimportowane
            await Message.create({ chatId: chat._id, senderId: userOne._id, content: 'To be deleted' });

            const newKeys = sodium.crypto_box_keypair();
            const newPublicKey_base64 = sodium.to_base64(newKeys.publicKey);

            const res = await request(app)
                .post('/api/keys/publish')
                .set('Authorization', `Bearer ${tokenOne}`)
                .send({ publicKey: newPublicKey_base64 });

            expect(res.statusCode).toEqual(200);
            expect(res.body.message).toContain('Chat history cleared'); // Sprawdź nowy komunikat

            const userInDb = await User.findById(userOne._id);
            expect(userInDb.publicKey).toBe(newPublicKey_base64);

            // Sprawdź, czy wiadomość została usunięta
            const messageCount = await Message.countDocuments({ chatId: chat._id });
            expect(messageCount).toBe(0);
        });

        it('should return a validation error for a missing public key', async () => {
            const res = await request(app)
                .post('/api/keys/publish')
                .set('Authorization', `Bearer ${tokenOne}`)
                .send({ publicKey: '' }); // Wyślij pusty string

            expect(res.statusCode).toEqual(400);
            expect(res.body.errors[0].msg).toBe('Public key is required.');
        });

        it('should return a validation error for a missing or empty public key', async () => {
            const res = await request(app)
                .post('/api/keys/publish')
                .set('Authorization', `Bearer ${tokenOne}`)
                .send({ publicKey: '  ' }); // Pusty string po .trim()

            expect(res.statusCode).toEqual(400);
            expect(res.body.errors[0].msg).toBe('Public key is required.');
        });

        it('should not allow publishing a key if not authenticated', async () => {
            const res = await request(app)
                .post('/api/keys/publish')
                // Brak nagłówka Authorization
                .send({ publicKey: userOnePublicKey_base64 });
            expect(res.statusCode).toEqual(401);
        });
    });

    describe('GET /api/keys/:userId', () => {
        beforeEach(async () => {
            // Przed każdym testem w tym bloku, userOne ma opublikowany klucz
            await User.findByIdAndUpdate(userOne._id, { publicKey: userOnePublicKey_base64 });
        });

        it('should allow a user (userTwo) to fetch the public key of another user (userOne)', async () => {
            const res = await request(app)
                .get(`/api/keys/${userOne._id}`)
                .set('Authorization', `Bearer ${tokenTwo}`); // userTwo pyta

            expect(res.statusCode).toEqual(200);
            expect(res.body.userId).toBe(userOne._id.toString());
            expect(res.body.publicKey).toBe(userOnePublicKey_base64);
            expect(res.body.username).toBe(userOne.username); // Sprawdź, czy dodatkowe dane są zwracane
        });

        it('should return 404 if the requested user has not published a key', async () => {
            // userTwo nie ma opublikowanego klucza
            const res = await request(app)
                .get(`/api/keys/${userTwo._id}`)
                .set('Authorization', `Bearer ${tokenOne}`);
            expect(res.statusCode).toEqual(404);
            expect(res.body.message).toBe('User not found or has not published a public key.');
        });

        it('should return 404 for a non-existent user', async () => {
            const nonExistentId = new mongoose.Types.ObjectId().toString();
            const res = await request(app)
                .get(`/api/keys/${nonExistentId}`)
                .set('Authorization', `Bearer ${tokenOne}`);
            expect(res.statusCode).toEqual(404);
        });

        it('should return a validation error for an invalid userId format', async () => {
            const res = await request(app)
                .get(`/api/keys/invalid-id-format`)
                .set('Authorization', `Bearer ${tokenOne}`);
            expect(res.statusCode).toEqual(400);
            expect(res.body.errors[0].msg).toBe('Invalid User ID format.');
        });
    });
});