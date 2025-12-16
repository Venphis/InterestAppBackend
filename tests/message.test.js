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

describe('Message API (/api/messages)', () => {
    let userOne, userTwo, userThree;
    let tokenOne, tokenTwo, tokenThree;
    let chatOneTwo;
    let userOneKeys, userTwoKeys; // Pary kluczy dla E2EE

    beforeAll(async () => {
        await sodium.ready; // Upewnij się, że libsodium jest gotowe do użycia
        await mongoose.connection.collection('users').deleteMany({});
        await mongoose.connection.collection('chats').deleteMany({});
        await mongoose.connection.collection('messages').deleteMany({});
        await mongoose.connection.collection('friendships').deleteMany({});

        userOne = await createVerifiedUser({ username: 'msgUserOne_e2ee', email: 'msgone_e2ee@example.com' });
        userTwo = await createVerifiedUser({ username: 'msgUserTwo_e2ee', email: 'msgtwo_e2ee@example.com' });
        userThree = await createVerifiedUser({ username: 'msgUserThree_e2ee', email: 'msgthree_e2ee@example.com' });

        tokenOne = generateUserToken(userOne);
        tokenTwo = generateUserToken(userTwo);
        tokenThree = generateUserToken(userThree);

        // Wygeneruj i zapisz klucze publiczne dla użytkowników, symulując wywołanie /api/keys/publish
        userOneKeys = sodium.crypto_box_keypair();
        userTwoKeys = sodium.crypto_box_keypair();
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
        it('should allow a user to send an encrypted message, which can be decrypted by the recipient', async () => {
            const originalMessage = 'This is a super secret message!';

            // --- Symulacja Szyfrowania (userOne) ---
            const recipientUserInDb = await User.findById(userTwo._id);
            const recipientPublicKey_base64 = recipientUserInDb.publicKey;

            // Konwertuj klucz publiczny odbiorcy z Base64 na Uint8Array
            const recipientPublicKey_uint8 = sodium.from_base64(recipientPublicKey_base64);
            // Generuj nonce jako Uint8Array
            const nonce = sodium.randombytes_buf(sodium.crypto_box_NONCEBYTES);

            const encryptedCiphertext_uint8 = sodium.crypto_box_easy(
                originalMessage,
                nonce, // Teraz Uint8Array
                recipientPublicKey_uint8, // Teraz Uint8Array
                userOneKeys.privateKey    // Już jest Uint8Array
            );

            // Przygotuj dane do wysłania (konwertuj bufory na Base64)
            const contentToSend = JSON.stringify({
                nonce: sodium.to_base64(nonce),
                ciphertext: sodium.to_base64(encryptedCiphertext_uint8)
            });


            const res = await request(app)
                .post('/api/messages')
                .set('Authorization', `Bearer ${tokenOne}`)
                .send({ chatId: chatOneTwo._id.toString(), content: contentToSend });

            expect(res.statusCode).toEqual(200);

            // --- Symulacja Deszyfrowania (userTwo) ---
            const messageInDb = await Message.findById(res.body._id);
            const receivedContent = JSON.parse(messageInDb.content);

            const decryptedMessage = sodium.crypto_box_open_easy(
                sodium.from_base64(receivedContent.ciphertext), // Konwertuj z powrotem na Uint8Array
                sodium.from_base64(receivedContent.nonce),     // Konwertuj z powrotem na Uint8Array
                userOneKeys.publicKey,  // Już jest Uint8Array
                userTwoKeys.privateKey, // Już jest Uint8Array
                'text'
            );

            expect(decryptedMessage).toBe(originalMessage);
        });

        // Pozostałe testy dla POST /api/messages
        it('should correctly update the lastMessage and lastMessageTimestamp on the parent chat', async () => {
             const res = await request(app)
                .post('/api/messages')
                .set('Authorization', `Bearer ${tokenOne}`)
                .send({ chatId: chatOneTwo._id.toString(), content: '{"nonce":"...","ciphertext":"..."}' }); // Wyślij poprawną (zaszyfrowaną) wiadomość

            expect(res.statusCode).toEqual(200);
            const updatedChat = await Chat.findById(chatOneTwo._id);
            expect(updatedChat.lastMessage.toString()).toBe(res.body._id);
        });

        it('should not allow sending a message to a chat they are not part of', async () => { /* ... bez zmian ... */ });
        it('should return a validation error for empty message content', async () => { /* ... bez zmian ... */ });
        it('should not allow sending a message if the friendship with the recipient is blocked', async () => { /* ... bez zmian ... */ });
    });

    describe('GET /api/messages/:chatId', () => {
        beforeEach(async () => {
            await Message.deleteMany({});
            // Używaj kluczy Uint8Array do szyfrowania
            const nonce1 = sodium.randombytes_buf(sodium.crypto_box_NONCEBYTES);
            const encrypted1 = sodium.crypto_box_easy('Encrypted message 1', nonce1, userTwoKeys.publicKey, userOneKeys.privateKey);
            const content1 = JSON.stringify({ nonce: sodium.to_base64(nonce1), ciphertext: sodium.to_base64(encrypted1) });

            const nonce2 = sodium.randombytes_buf(sodium.crypto_box_NONCEBYTES);
            const encrypted2 = sodium.crypto_box_easy('Encrypted message 2', nonce2, userOneKeys.publicKey, userTwoKeys.privateKey);
            const content2 = JSON.stringify({ nonce: sodium.to_base64(nonce2), ciphertext: sodium.to_base64(encrypted2) });

            await createMessage({ chatId: chatOneTwo, senderId: userOne, content: content1 });
            await createMessage({ chatId: chatOneTwo, senderId: userTwo, content: content2 });
        });

        it('should fetch encrypted messages for a chat, which can then be decrypted by a participant', async () => {
            const res = await request(app)
                .get(`/api/messages/${chatOneTwo._id}`)
                .set('Authorization', `Bearer ${tokenOne}`); // userOne pobiera wiadomości

            expect(res.statusCode).toEqual(200);
            const messages = res.body.messages;
            expect(messages.length).toBe(2);

            // userOne (pobierający) odszyfrowuje wiadomość wysłaną DO NIEGO (przez userTwo)
            const content2 = JSON.parse(messages[1].content);
            const decrypted2 = sodium.crypto_box_open_easy(
                sodium.from_base64(content2.ciphertext), // Poprawiony format
                sodium.from_base64(content2.nonce),     // Poprawiony format
                userTwoKeys.publicKey,  // Poprawny format (Uint8Array)
                userOneKeys.privateKey, // Poprawny format (Uint8Array)
                'text'
            );
            expect(decrypted2).toBe('Encrypted message 2');
        });

        it('should handle pagination for encrypted messages correctly', async () => {
            await Message.deleteMany({});
            for (let i = 1; i <= 25; i++) {
                const nonce = sodium.randombytes_buf(sodium.crypto_box_NONCEBYTES);
                // POPRAWKA: Używaj kluczy Uint8Array
                const encrypted = sodium.crypto_box_easy(`Paginated message ${i}`, nonce, userTwoKeys.publicKey, userOneKeys.privateKey);
                await createMessage({ chatId: chatOneTwo, senderId: userOne, content: JSON.stringify({nonce: sodium.to_base64(nonce), ciphertext: sodium.to_base64(encrypted)}) });
            }

            const res = await request(app)
                .get(`/api/messages/${chatOneTwo._id}?page=2&limit=10`)
                .set('Authorization', `Bearer ${tokenTwo}`); // Zmieniamy na tokenTwo, bo to on jest odbiorcą

            expect(res.statusCode).toEqual(200);
            expect(res.body.messages.length).toBe(10);
            expect(res.body.currentPage).toBe(2);
            expect(res.body.totalPages).toBe(3);

            const firstMsgOnPage2 = JSON.parse(res.body.messages[0].content);
            const decryptedContent = sodium.crypto_box_open_easy(
                sodium.from_base64(firstMsgOnPage2.ciphertext), // Poprawiony format
                sodium.from_base64(firstMsgOnPage2.nonce),     // Poprawiony format
                userOneKeys.publicKey,  // Poprawny format (Uint8Array)
                userTwoKeys.privateKey, // Poprawny format (Uint8Array)
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