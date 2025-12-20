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
                'backup.encryptedPrivateKey': "",
                'backup.encryptedBackupKey': "",
                'backup.passwordDerivationParams': ""
            }
        });
    });

    describe('POST /api/backups (Save Backup)', () => {
        const validBackupData = {
            encryptedPrivateKey: 'dGhpcyBpcyBhIGZha2UgZW5jcnlwdGVkIHByaXZhdGUga2V5', // Fikcyjne dane Base64
            encryptedBackupKey: 'dGhpcyBpcyBhIGZha2UgZW5jcnlwdGVkIGJhY2t1cCBrZXk=',
            passwordDerivationParams: {
                algorithm: 'argon2id13',
                salt: 'c29tZXJhbmRvbXNhbHQ=', // Fikcyjna sól w Base64
                opsLimit: 2,
                memLimit: 67108864
            }
        };

        it('should allow a logged-in user to save their encrypted key backup', async () => {
            const res = await request(app)
                .post('/api/backups')
                .set('Authorization', `Bearer ${testUserToken}`)
                .send(validBackupData);

            expect(res.statusCode).toEqual(200);
            expect(res.body.message).toBe('Backup saved successfully.');

            // Sprawdź, czy dane zostały poprawnie zapisane w bazie danych
            // Musimy jawnie wybrać pole 'backup', bo ma `select: false` w schemacie
            const userInDb = await User.findById(testUser._id).select('+backup');
            expect(userInDb.backup).toBeDefined();
            expect(userInDb.backup.encryptedPrivateKey).toBe(validBackupData.encryptedPrivateKey);
            expect(userInDb.backup.encryptedBackupKey).toBe(validBackupData.encryptedBackupKey);
            expect(userInDb.backup.passwordDerivationParams.salt).toBe(validBackupData.passwordDerivationParams.salt);
        });

        it('should not allow saving a backup if not authenticated', async () => {
            const res = await request(app)
                .post('/api/backups')
                // Brak tokenu
                .send(validBackupData);
            expect(res.statusCode).toEqual(401);
        });

        it('should return validation errors for missing or invalid backup data', async () => {
            const invalidData = { ...validBackupData, encryptedPrivateKey: 'not base64' };

            const res = await request(app)
                .post('/api/backups')
                .set('Authorization', `Bearer ${testUserToken}`)
                .send(invalidData);

            expect(res.statusCode).toEqual(400);
            expect(res.body).toHaveProperty('errors');
            expect(res.body.errors.some(e => e.path === 'encryptedPrivateKey' && e.msg === 'encryptedPrivateKey must be a Base64 string.')).toBe(true);
        });

        it('should overwrite an existing backup when a new one is posted', async () => {
            // Zapisz stary backup
            await request(app)
                .post('/api/backups')
                .set('Authorization', `Bearer ${testUserToken}`)
                .send(validBackupData);

            // Przygotuj nowe dane
            const newBackupData = {
                ...validBackupData,
                encryptedPrivateKey: 'bmV3X2VuY3J5cHRlZF9rZXk=' // Nowe dane
            };

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
        const backupData = {
            encryptedPrivateKey: 'ZXhpc3RpbmdfcHJpdmF0ZV9rZXk=',
            encryptedBackupKey: 'ZXhpc3RpbmdfYmFja3VwX2tleQ==',
            passwordDerivationParams: {
                algorithm: 'argon2id13', salt: 'c29tZXNhbHQ=', opsLimit: 2, memLimit: 67108864
            }
        };

        it('should return the user\'s backup data if it exists', async () => {
            // Najpierw zapisz backup w bazie
            await User.findByIdAndUpdate(testUser._id, { backup: backupData });

            const res = await request(app)
                .get('/api/backups')
                .set('Authorization', `Bearer ${testUserToken}`);

            expect(res.statusCode).toEqual(200);
            expect(res.body.encryptedPrivateKey).toBe(backupData.encryptedPrivateKey);
            expect(res.body.passwordDerivationParams.algorithm).toBe(backupData.passwordDerivationParams.algorithm);
        });

        it('should return 404 if no backup exists for the user', async () => {
            // Baza jest czyszczona w beforeEach, więc użytkownik nie ma backupu
            const res = await request(app)
                .get('/api/backups')
                .set('Authorization', `Bearer ${testUserToken}`);

            expect(res.statusCode).toEqual(404);
            expect(res.body.message).toBe('No backup found for this user.');
        });

        it('should not allow getting a backup if not authenticated', async () => {
            const res = await request(app)
                .get('/api/backups');
                // Brak tokenu
            expect(res.statusCode).toEqual(401);
        });
    });
});