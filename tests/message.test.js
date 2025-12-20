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

describe('Message API (/api/messages) with E2EE', () => {
    let userOne, userTwo, userThree;
    let tokenOne, tokenTwo, tokenThree;
    let chatOneTwo;
    let userOneKeys, userTwoKeys; // Pary kluczy dla E2EE w formacie Uint8Array

    beforeAll(async () => {
        await sodium.ready; // Upewnij się, że libsodium jest gotowe
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

        // Generuj klucze jako Uint8Array
        userOneKeys = sodium.crypto_box_keypair();
        userTwoKeys = sodium.crypto_box_keypair();

        // Symuluj publikację kluczy (zapisz do bazy jako stringi Base64)
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

            // --- Symulacja Szyfrowania po Stronie Klienta (userOne) ---
            const selfPublicKey_uint8 = userOneKeys.publicKey;
            const recipientPublicKey_uint8 = userTwoKeys.publicKey;

            // Szyfruj dla odbiorcy (userTwo)
            const nonceForTwo = sodium.randombytes_buf(sodium.crypto_box_NONCEBYTES);
            const encryptedForTwo = sodium.crypto_box_easy(originalMessage, nonceForTwo, recipientPublicKey_uint8, userOneKeys.privateKey);

            // Szyfruj dla siebie samego (userOne)
            const nonceForOne = sodium.randombytes_buf(sodium.crypto_box_NONCEBYTES);
            const encryptedForOne = sodium.crypto_box_easy(originalMessage, nonceForOne, selfPublicKey_uint8, userOneKeys.privateKey);

            const contentToSend = {
                [userTwo._id.toString()]: JSON.stringify({
                    nonce: sodium.to_base64(nonceForTwo),
                    ciphertext: sodium.to_base64(encryptedForTwo)
                }),
                [userOne._id.toString()]: JSON.stringify({
                    nonce: sodium.to_base64(nonceForOne),
                    ciphertext: sodium.to_base64(encryptedForOne)
                })
            };

            const res = await request(app)
                .post('/api/messages')
                .set('Authorization', `Bearer ${tokenOne}`)
                .send({ chatId: chatOneTwo._id.toString(), content: contentToSend });

            expect(res.statusCode).toEqual(200);

            // --- Weryfikacja ---
            const messageInDb = await Message.findById(res.body._id);
            expect(messageInDb.content).toBeInstanceOf(Object);
            expect(messageInDb.content).toHaveProperty(userOne._id.toString());
            expect(messageInDb.content).toHaveProperty(userTwo._id.toString());

            // Symuluj deszyfrowanie przez ODBIORCĘ (userTwo)
            const contentForTwo = JSON.parse(messageInDb.content[userTwo._id.toString()]);
            const decryptedByTwo = sodium.crypto_box_open_easy(
                sodium.from_base64(contentForTwo.ciphertext), sodium.from_base64(contentForTwo.nonce),
                userOneKeys.publicKey, userTwoKeys.privateKey, 'text'
            );
            expect(decryptedByTwo).toBe(originalMessage);

            // Symuluj deszyfrowanie przez NADAWCĘ (userOne)
            const contentForOne = JSON.parse(messageInDb.content[userOne._id.toString()]);
            const decryptedByOne = sodium.crypto_box_open_easy(
                sodium.from_base64(contentForOne.ciphertext), sodium.from_base64(contentForOne.nonce),
                userOneKeys.publicKey, // Używa swojego klucza publicznego do weryfikacji
                userOneKeys.privateKey,
                'text'
            );
            expect(decryptedByOne).toBe(originalMessage);
        });

        it('should correctly update the lastMessage and lastMessageTimestamp on the parent chat', async () => {
            const contentToSend = { // Stwórz poprawny, ale pusty obiekt content
                [userOne._id.toString()]: "{}",
                [userTwo._id.toString()]: "{}"
            };
            const res = await request(app)
                .post('/api/messages')
                .set('Authorization', `Bearer ${tokenOne}`)
                .send({ chatId: chatOneTwo._id.toString(), content: contentToSend });

            expect(res.statusCode).toEqual(200);
            const updatedChat = await Chat.findById(chatOneTwo._id);
            expect(updatedChat.lastMessage.toString()).toBe(res.body._id);
        });

        it('should not allow sending a message to a chat they are not part of', async () => {
            const contentToSend = { [userOne._id.toString()]: "{}" }; // Fikcyjny content
            const res = await request(app)
                .post('/api/messages')
                .set('Authorization', `Bearer ${tokenThree}`)
                .send({ chatId: chatOneTwo._id.toString(), content: contentToSend });
            expect(res.statusCode).toEqual(404);
        });

        it('should return a validation error for invalid content format (not an object)', async () => {
            const res = await request(app)
                .post('/api/messages')
                .set('Authorization', `Bearer ${tokenOne}`)
                .send({ chatId: chatOneTwo._id.toString(), content: 'just a string' });
            expect(res.statusCode).toEqual(400);
            expect(res.body.errors[0].msg).toBe('Content must be an object.');
        });
        
        it('should return an error if content is missing an encrypted version for a participant', async () => {
             const contentToSend = { // Brakuje wersji dla userOne
                [userTwo._id.toString()]: "{...}"
            };
            const res = await request(app)
                .post('/api/messages')
                .set('Authorization', `Bearer ${tokenOne}`)
                .send({ chatId: chatOneTwo._id.toString(), content: contentToSend });
            expect(res.statusCode).toEqual(400);
            expect(res.body.message).toContain('Content must include an encrypted version for every chat participant.');
        });

        it('should not allow sending a message if the friendship with the recipient is blocked', async () => {
            await Friendship.updateOne(
                { $or: [{ user1: userOne._id, user2: userTwo._id }, { user1: userTwo._id, user2: userOne._id }] },
                { status: 'blocked', isBlocked: true, blockedBy: userOne._id }
            );
            const contentToSend = { [userOne._id.toString()]: "{}", [userTwo._id.toString()]: "{}" };
            const res = await request(app)
                .post('/api/messages')
                .set('Authorization', `Bearer ${tokenTwo}`) // userTwo próbuje wysłać
                .send({ chatId: chatOneTwo._id.toString(), content: contentToSend });
            expect(res.statusCode).toEqual(403);
            expect(res.body.message).toContain('Cannot send message, user is blocked.');
        });
    });

    describe('GET /api/messages/:chatId', () => {
        beforeEach(async () => {
            await Message.deleteMany({});
            const originalMessage1 = 'Encrypted message 1';
            const nonce1_for_two = sodium.randombytes_buf(sodium.crypto_box_NONCEBYTES);
            const enc1_for_two = sodium.crypto_box_easy(originalMessage1, nonce1_for_two, userTwoKeys.publicKey, userOneKeys.privateKey);
            const nonce1_for_one = sodium.randombytes_buf(sodium.crypto_box_NONCEBYTES);
            const enc1_for_one = sodium.crypto_box_easy(originalMessage1, nonce1_for_one, userOneKeys.publicKey, userOneKeys.privateKey);

            const content1 = {
                [userOne._id.toString()]: JSON.stringify({ nonce: sodium.to_base64(nonce1_for_one), ciphertext: sodium.to_base64(enc1_for_one) }),
                [userTwo._id.toString()]: JSON.stringify({ nonce: sodium.to_base64(nonce1_for_two), ciphertext: sodium.to_base64(enc1_for_two) })
            };
            await createMessage({ chatId: chatOneTwo, senderId: userOne, content: content1 });
        });

        it('should fetch an encrypted message that can be decrypted by the recipient', async () => {
            const res = await request(app)
                .get(`/api/messages/${chatOneTwo._id}`)
                .set('Authorization', `Bearer ${tokenTwo}`); // userTwo (odbiorca) pobiera

            expect(res.statusCode).toEqual(200);
            const message = res.body.messages[0];
            expect(message.content).toHaveProperty(userTwo._id.toString());

            const contentForTwo = JSON.parse(message.content[userTwo._id.toString()]);
            const decrypted = sodium.crypto_box_open_easy(
                sodium.from_base64(contentForTwo.ciphertext),
                sodium.from_base64(contentForTwo.nonce),
                userOneKeys.publicKey, // klucz publiczny nadawcy
                userTwoKeys.privateKey, // klucz prywatny odbiorcy
                'text'
            );
            expect(decrypted).toBe('Encrypted message 1');
        });

        it('should handle pagination for encrypted messages correctly', async () => {
            await Message.deleteMany({});
            for (let i = 1; i <= 25; i++) {
                const nonce_for_two = sodium.randombytes_buf(sodium.crypto_box_NONCEBYTES);
                const encrypted_for_two = sodium.crypto_box_easy(`Paginated message ${i}`, nonce_for_two, userTwoKeys.publicKey, userOneKeys.privateKey);
                const nonce_for_one = sodium.randombytes_buf(sodium.crypto_box_NONCEBYTES);
                const encrypted_for_one = sodium.crypto_box_easy(`Paginated message ${i}`, nonce_for_one, userOneKeys.publicKey, userOneKeys.privateKey);

                const content = {
                    [userOne._id.toString()]: JSON.stringify({ nonce: sodium.to_base64(nonce_for_one), ciphertext: sodium.to_base64(encrypted_for_one) }),
                    [userTwo._id.toString()]: JSON.stringify({ nonce: sodium.to_base64(nonce_for_two), ciphertext: sodium.to_base64(encrypted_for_two) })
                };
                await createMessage({ chatId: chatOneTwo, senderId: userOne, content });
            }

            const res = await request(app)
                .get(`/api/messages/${chatOneTwo._id}?page=2&limit=10`)
                .set('Authorization', `Bearer ${tokenTwo}`);

            expect(res.statusCode).toEqual(200);
            expect(res.body.messages.length).toBe(10);
            expect(res.body.currentPage).toBe(2);
            expect(res.body.totalPages).toBe(3);

            const firstMsgOnPage2 = JSON.parse(res.body.messages[0].content[userTwo._id.toString()]);
            const decryptedContent = sodium.crypto_box_open_easy(
                sodium.from_base64(firstMsgOnPage2.ciphertext),
                sodium.from_base64(firstMsgOnPage2.nonce),
                userOneKeys.publicKey,
                userTwoKeys.privateKey,
                'text'
            );
            expect(decryptedContent).toBe('Paginated message 6');
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