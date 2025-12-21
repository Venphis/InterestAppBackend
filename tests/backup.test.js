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
                'backup': "" // Usunięcie całego obiektu backup
            }
        });
    });

    // Zaktualizowane przykładowe dane zgodne z nowym schematem
    const validBackupData = {
        publicKey: 'valid_public_key_base64',
        
        // Teraz same ciphertexty
        encryptedPrivateKey: 'private_key_ciphertext_base64',
        encryptedBackupKey: 'backup_key_ciphertext_base64',

        passwordDerivationParams: {
            algorithm: 'argon2id13',
            salt: 'some_salt_base64',
            opsLimit: 2,
            memLimit: 67108864,
            parallelism: 1,
            hashLength: 32,
            verificator: 'dGhpcyBpcyBhIHZlcmlmaWVy' // 'this is a verifier' w Base64
        },

        backupEncryptionParams: {
            algorithm: 'AES-256-GCM',
            iv: 'iv_base64_bkp',
            tagLength: 128
        },

        privateEncryptionParams: {
            algorithm: 'AES-256-GCM',
            iv: 'iv_base64_priv',
            tagLength: 128
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
            
            // Sprawdź pola
            expect(userInDb.backup.publicKey).toBe(validBackupData.publicKey);
            expect(userInDb.backup.encryptedPrivateKey).toBe(validBackupData.encryptedPrivateKey);
            expect(userInDb.backup.encryptedBackupKey).toBe(validBackupData.encryptedBackupKey);
            
            // Sprawdź zagnieżdżone obiekty
            expect(userInDb.backup.passwordDerivationParams.verificator).toBe(validBackupData.passwordDerivationParams.verificator);
            expect(userInDb.backup.backupEncryptionParams.iv).toBe(validBackupData.backupEncryptionParams.iv);
            expect(userInDb.backup.privateEncryptionParams.iv).toBe(validBackupData.privateEncryptionParams.iv);
        });

        it('should not allow saving a backup if not authenticated', async () => {
            const res = await request(app)
                .post('/api/backups')
                .send(validBackupData);
            expect(res.statusCode).toEqual(401);
        });

        it('should return validation errors for missing or invalid backup data structure', async () => {
            // Próba wysłania bez pola 'verificator' w passwordDerivationParams
            const invalidData = JSON.parse(JSON.stringify(validBackupData));
            delete invalidData.passwordDerivationParams.verificator;

            const res = await request(app)
                .post('/api/backups')
                .set('Authorization', `Bearer ${testUserToken}`)
                .send(invalidData);

            expect(res.statusCode).toEqual(400);
        });

        it('should overwrite an existing backup when a new one is posted', async () => {
            // Zapisz stary backup
            await request(app)
                .post('/api/backups')
                .set('Authorization', `Bearer ${testUserToken}`)
                .send(validBackupData);

            // Przygotuj nowe dane
            const newBackupData = JSON.parse(JSON.stringify(validBackupData));
            newBackupData.encryptedPrivateKey = 'bmV3X2VuY3J5cHRlZF9rZXk='; // Nowe dane

            const res = await request(app)
                .post('/api/backups')
                .set('Authorization', `Bearer ${testUserToken}`)
                .send(newBackupData);

            expect(res.statusCode).toEqual(200);

            const userInDb = await User.findById(testUser._id).select('+backup');
            expect(userInDb.backup.encryptedPrivateKey).toBe(newBackupData.encryptedPrivateKey);
            expect(userInDb.backup.encryptedPrivateKey).not.toBe(validBackupData.encryptedPrivateKey);
        });
    });

    describe('GET /api/backups (Get Backup)', () => {
        it('should return the user\'s backup data if it exists', async () => {
            // Zapisz backup przez API
            await request(app).post('/api/backups').set('Authorization', `Bearer ${testUserToken}`).send(validBackupData);

            const res = await request(app)
                .get('/api/backups')
                .set('Authorization', `Bearer ${testUserToken}`);

            expect(res.statusCode).toEqual(200);
            expect(res.body.encryptedPrivateKey).toBe(validBackupData.encryptedPrivateKey);
            expect(res.body.passwordDerivationParams.verificator).toBe(validBackupData.passwordDerivationParams.verificator);
            expect(res.body.backupEncryptionParams.iv).toBe(validBackupData.backupEncryptionParams.iv);
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
            // Usuń backup
            await User.findByIdAndUpdate(testUser._id, { $unset: { 'backup': "" } });
            
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

        it('should update encryptedBackupKey, params and verificator', async () => {
            const newEncryptedBackupKey = 'new_backup_key_ciphertext_base64';
            
            const newParams = {
                ...validBackupData.passwordDerivationParams,
                salt: 'new_salt_base64',
                verificator: 'new_verifier_base64'
            };

            const newBackupEncParams = {
                ...validBackupData.backupEncryptionParams,
                iv: 'new_iv_base64'
            };

            const res = await request(app)
                .put('/api/backups/password')
                .set('Authorization', `Bearer ${testUserToken}`)
                .send({
                    encryptedBackupKey: newEncryptedBackupKey,
                    passwordDerivationParams: newParams,
                    backupEncryptionParams: newBackupEncParams,
                    passwordVerifier: 'new_verifier_base64' // To pole jest redundantne jeśli jest w params, ale może być wymagane przez walidator
                });

            expect(res.statusCode).toEqual(200);
            expect(res.body.message).toContain('updated successfully');

            const userInDb = await User.findById(testUser._id).select('+backup');
            
            // Sprawdź zaktualizowane pola
            expect(userInDb.backup.encryptedBackupKey).toBe(newEncryptedBackupKey);
            expect(userInDb.backup.passwordDerivationParams.salt).toBe(newParams.salt);
            expect(userInDb.backup.passwordDerivationParams.verificator).toBe(newParams.verificator);
            expect(userInDb.backup.backupEncryptionParams.iv).toBe(newBackupEncParams.iv);

            // encryptedPrivateKey nie powinno się zmienić
            expect(userInDb.backup.encryptedPrivateKey).toBe(validBackupData.encryptedPrivateKey);
        });

        it('should return 404 if no backup exists to update', async () => {
            await User.findByIdAndUpdate(testUser._id, { $unset: { backup: "" } });

            const res = await request(app)
                .put('/api/backups/password')
                .set('Authorization', `Bearer ${testUserToken}`)
                .send({
                    encryptedBackupKey: 'some_key',
                    passwordVerifier: 'new_verifier',
                    // ... inne wymagane pola
                });

            // Oczekujemy 404 albo 400 (walidacja), w zależności od tego, co pierwsze zawiedzie.
            // Jeśli walidatory wymagają pełnych obiektów, a tu ich nie ma, to będzie 400.
            // Ale testujemy logikę biznesową "brak backupu", więc zakładamy poprawne dane wejściowe:
             const validUpdateData = {
                encryptedBackupKey: 'new_key',
                passwordDerivationParams: validBackupData.passwordDerivationParams,
                backupEncryptionParams: validBackupData.backupEncryptionParams,
                passwordVerifier: 'ver'
            };
            
            const res2 = await request(app)
                .put('/api/backups/password')
                .set('Authorization', `Bearer ${testUserToken}`)
                .send(validUpdateData);

            expect(res2.statusCode).toEqual(404);
        });
    });
});