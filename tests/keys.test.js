// tests/keys.test.js
const request = require('supertest');
const app = require('../server');
const User = require('../models/User');
const { createVerifiedUser, generateUserToken } = require('./helpers/factories');
const mongoose = require('mongoose');
const sodium = require('libsodium-wrappers'); // Import libsodium

describe('Key Management API (/api/keys)', () => {
    let userOne, userTwo;
    let tokenOne, tokenTwo;
    let userOneKeys;

    beforeAll(async () => {
        await mongoose.connection.collection('users').deleteMany({});
        userOne = await createVerifiedUser({ username: 'keyUserOne', email: 'keyone@example.com' });
        userTwo = await createVerifiedUser({ username: 'keyUserTwo', email: 'keytwo@example.com' });
        tokenOne = generateUserToken(userOne);
        tokenTwo = generateUserToken(userTwo);
        await sodium.ready; // Upewnij się, że libsodium jest gotowe
    });

    beforeEach(async () => {
        // Wygeneruj klucze dla userOne i opublikuj je
        userOneKeys = sodium.crypto_box_keypair('base64'); // Generuj parę kluczy w formacie base64
        await request(app)
            .post('/api/keys/publish')
            .set('Authorization', `Bearer ${tokenOne}`)
            .send({ publicKey: userOneKeys.publicKey });
    });


    it('should allow a user to publish their public key', async () => {
        const userInDb = await User.findById(userOne._id);
        expect(userInDb.publicKey).toBe(userOneKeys.publicKey);
    });

    it('should allow another user to fetch that public key', async () => {
        const res = await request(app)
            .get(`/api/keys/${userOne._id}`)
            .set('Authorization', `Bearer ${tokenTwo}`); // userTwo pyta o klucz userOne

        expect(res.statusCode).toEqual(200);
        expect(res.body.userId).toBe(userOne._id.toString());
        expect(res.body.publicKey).toBe(userOneKeys.publicKey);
    });

    it('should return 404 if user has not published a key', async () => {
        const res = await request(app)
            .get(`/api/keys/${userTwo._id}`) // userTwo jeszcze nie opublikował klucza
            .set('Authorization', `Bearer ${tokenOne}`);
        expect(res.statusCode).toEqual(404);
    });
});