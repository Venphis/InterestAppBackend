// tests/backup.test.js
const request = require('supertest');
const app = require('../server');
const User = require('../models/User');
const { createVerifiedUser, generateUserToken } = require('./helpers/factories');
const mongoose = require('mongoose');

describe('Backup API (/api/backups)', () => {
    let testUser;
    let testUserToken;

    beforeAll(async () => {
        // Czysty start
        await mongoose.connection.collection('users').deleteMany({});
        testUser = await createVerifiedUser({ username: 'backupUser', email: 'backup@example.com' });
        testUserToken = generateUserToken(testUser);
    });

    // Wyczyść dane backupu z profilu użytkownika przed każdym testem
    beforeEach(async () => {
        await User.findByIdAndUpdate(testUser._id, {
            $unset: {
                'backup.publicKey': "",
                'backup.passwordVerifier': "",
                'backup.encryptedPrivateKey': "",
                'backup.encryptedBackupKey': "",
                'backup.passwordDerivationParams': ""
            }
        });
    });

    // Zaktualizowane przykładowe dane zgodne z nowym schematem
    const validBackupData = {
        publicKey: 'valid_public_key_base64',
        passwordVerifier: 'dGhpcyBpcyBhIHZlcmlmaWVy', // 'this is a verifier' w Base64
        encryptedPrivateKey: {
            iv: 'iv_base64_priv',
            tag: 'tag_base64_priv',
            ciphertext: 'private_key_ciphertext_base64'
        },
        encryptedBackupKey: {
            iv: 'iv_base64_bkp',
            tag: 'tag_base64_bkp',
            ciphertext: 'backup_key_ciphertext_base64'
        },
        passwordDerivationParams: {
            algorithm: 'argon2id13',
            salt: 'some_salt_base64',
            opsLimit: 2,
            memLimit: 67108864,
            parallelism: 1,
            hashLength: 32
        }
    };

    describe('POST /api/backups (Save Backup)', () => {
        it('should allow a logged-in user to save their encrypted key backup', async () => {
            const res = await request(app)
                .post('/api/backups')
                .set('Authorization', `Bearer ${testUserToken}`)
                .send(validBackupData);

            expect(res.statusCode).toEqual(200);
            expect(res.body.message).toBe('Backup saved successfully.');

            // Sprawdź, czy dane zostały poprawnie zapisane w bazie danych
            const userInDb = await User.findById(testUser._id).select('+backup');
            expect(userInDb.backup).toBeDefined();
            // Sprawdź zagnieżdżone pola
            expect(userInDb.backup.encryptedPrivateKey.ciphertext).toBe(validBackupData.encryptedPrivateKey.ciphertext);
            expect(userInDb.backup.encryptedPrivateKey.iv).toBe(validBackupData.encryptedPrivateKey.iv);
            expect(userInDb.backup.encryptedBackupKey.ciphertext).toBe(validBackupData.encryptedBackupKey.ciphertext);
            expect(userInDb.backup.publicKey).toBe(validBackupData.publicKey);
            expect(userInDb.backup.passwordVerifier).toBe(validBackupData.passwordVerifier);
            expect(userInDb.backup.passwordDerivationParams.parallelism).toBe(validBackupData.passwordDerivationParams.parallelism);
        });

        it('should not allow saving a backup if not authenticated', async () => {
            const res = await request(app)
                .post('/api/backups')
                .send(validBackupData);
            expect(res.statusCode).toEqual(401);
        });

        it('should return validation errors for missing or invalid backup data structure', async () => {
            // Próba wysłania bez pola 'iv' w encryptedPrivateKey
            const invalidData = JSON.parse(JSON.stringify(validBackupData));
            delete invalidData.encryptedPrivateKey.iv;

            const res = await request(app)
                .post('/api/backups')
                .set('Authorization', `Bearer ${testUserToken}`)
                .send(invalidData);

            expect(res.statusCode).toEqual(400);
            // Sprawdź, czy walidator (np. express-validator lub mongoose validation) wykrył błąd
            // To zależy od tego, jak dokładnie zaimplementowałeś walidację w kontrolerze lub modelu
            // Jeśli Mongoose rzuci ValidationError, kontroler powinien zwrócić 400 lub 500
        });

        it('should overwrite an existing backup when a new one is posted', async () => {
            // Zapisz stary backup
            await request(app)
                .post('/api/backups')
                .set('Authorization', `Bearer ${testUserToken}`)
                .send(validBackupData);

            // Przygotuj nowe dane
            const newBackupData = JSON.parse(JSON.stringify(validBackupData));
            newBackupData.encryptedPrivateKey.ciphertext = 'bmV3X2VuY3J5cHRlZF9rZXk='; // Nowe dane

            const res = await request(app)
                .post('/api/backups')
                .set('Authorization', `Bearer ${testUserToken}`)
                .send(newBackupData);

            expect(res.statusCode).toEqual(200);

            const userInDb = await User.findById(testUser._id).select('+backup');
            expect(userInDb.backup.encryptedPrivateKey.ciphertext).toBe(newBackupData.encryptedPrivateKey.ciphertext);
            expect(userInDb.backup.encryptedPrivateKey.ciphertext).not.toBe(validBackupData.encryptedPrivateKey.ciphertext);
        });
    });

    describe('GET /api/backups (Get Backup)', () => {
        it('should return the user\'s backup data if it exists', async () => {
            // Zapisz backup ręcznie w bazie (lub użyj POST)
            // Używamy POST, aby mieć pewność, że struktura jest poprawna
            await request(app).post('/api/backups').set('Authorization', `Bearer ${testUserToken}`).send(validBackupData);

            const res = await request(app)
                .get('/api/backups')
                .set('Authorization', `Bearer ${testUserToken}`);

            expect(res.statusCode).toEqual(200);
            expect(res.body.encryptedPrivateKey.ciphertext).toBe(validBackupData.encryptedPrivateKey.ciphertext);
            expect(res.body.passwordDerivationParams.algorithm).toBe(validBackupData.passwordDerivationParams.algorithm);
            expect(res.body.passwordVerifier).toBe(validBackupData.passwordVerifier);
        });

        it('should return 404 if no backup exists for the user', async () => {
            const res = await request(app)
                .get('/api/backups')
                .set('Authorization', `Bearer ${testUserToken}`);

            expect(res.statusCode).toEqual(404);
            expect(res.body.message).toBe('No backup found for this user.');
        });

        it('should not allow getting a backup if not authenticated', async () => {
            const res = await request(app).get('/api/backups');
            expect(res.statusCode).toEqual(401);
        });
    });

    // --- TESTY DLA WERYFIKACJI HASŁA ---
    describe('POST /api/backups/verify-password', () => {
        const verifier = 'dGhpcyBpcyBhIHZlcmlmaWVy'; // Ten sam co w validBackupData

        beforeEach(async () => {
            // Ustaw backup z weryfikatorem
            await request(app).post('/api/backups').set('Authorization', `Bearer ${testUserToken}`).send(validBackupData);
        });

        it('should return success for correct password verifier', async () => {
            const res = await request(app)
                .post('/api/backups/verify-password')
                .set('Authorization', `Bearer ${testUserToken}`)
                .send({ passwordVerifier: verifier });

            expect(res.statusCode).toEqual(200);
            expect(res.body.valid).toBe(true);
            expect(res.body.message).toBe("Password is correct.");
        });

        it('should return error for incorrect password verifier', async () => {
            const wrongVerifier = 'd3JvbmcgdmVyaWZpZXI='; // 'wrong verifier' w Base64
            const res = await request(app)
                .post('/api/backups/verify-password')
                .set('Authorization', `Bearer ${testUserToken}`)
                .send({ passwordVerifier: wrongVerifier });

            expect(res.statusCode).toEqual(400); // Lub 200 z valid: false, zależy od implementacji
            expect(res.body.valid).toBe(false);
            expect(res.body.message).toBe("Invalid password.");
        });

        it('should return 404 if no backup/verifier exists', async () => {
            await User.findByIdAndUpdate(testUser._id, { $unset: { 'backup.passwordVerifier': "" } });
            
            const res = await request(app)
                .post('/api/backups/verify-password')
                .set('Authorization', `Bearer ${testUserToken}`)
                .send({ passwordVerifier: verifier });

            expect(res.statusCode).toEqual(404);
            expect(res.body.message).toContain("No backup or verifier found");
        });
    });

    // --- TESTY DLA ZMIANY HASŁA BACKUPU ---
    describe('PUT /api/backups/password', () => {
        beforeEach(async () => {
             // Ustaw początkowy backup
             await request(app).post('/api/backups').set('Authorization', `Bearer ${testUserToken}`).send(validBackupData);
        });

        it('should update encryptedBackupKey and params', async () => {
            const newEncryptedBackupKey = {
                iv: 'new_iv_base64',
                tag: 'new_tag_base64',
                ciphertext: 'new_backup_key_ciphertext'
            };
            const newParams = {
                ...validBackupData.passwordDerivationParams,
                salt: 'new_salt_base64'
            };

            const res = await request(app)
                .put('/api/backups/password')
                .set('Authorization', `Bearer ${testUserToken}`)
                .send({
                    encryptedBackupKey: newEncryptedBackupKey,
                    passwordDerivationParams: newParams,
                    passwordVerifier: 'new_verifier_base64' // Aktualizacja weryfikatora też jest ważna!
                });

            expect(res.statusCode).toEqual(200);
            expect(res.body.message).toContain('updated successfully');

            const userInDb = await User.findById(testUser._id).select('+backup');
            expect(userInDb.backup.encryptedBackupKey.ciphertext).toBe(newEncryptedBackupKey.ciphertext);
            expect(userInDb.backup.passwordDerivationParams.salt).toBe(newParams.salt);
            expect(userInDb.backup.passwordVerifier).toBe('new_verifier_base64');
            // encryptedPrivateKey nie powinno się zmienić
            expect(userInDb.backup.encryptedPrivateKey.ciphertext).toBe(validBackupData.encryptedPrivateKey.ciphertext);
        });

        it('should return 404 if no backup exists to update', async () => {
            await User.findByIdAndUpdate(testUser._id, { $unset: { backup: "" } });

            const res = await request(app)
                .put('/api/backups/password')
                .set('Authorization', `Bearer ${testUserToken}`)
                .send({
                    encryptedBackupKey: validBackupData.encryptedBackupKey,
                    passwordVerifier: 'new_verifier'
                });

            expect(res.statusCode).toEqual(404);
        });
    });
});