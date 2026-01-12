const request = require('supertest');
const app = require('../server');
const User = require('../models/User');
const { createVerifiedUser, generateUserToken } = require('./helpers/factories');
const mongoose = require('mongoose');

describe('Backup API (/api/backups)', () => {
    let testUser;
    let testUserToken;

    const validBackupData = {
        publicKey: 'valid_public_key_base64',
        encryptedPrivateKey: 'private_key_ciphertext_base64',
        encryptedBackupKey: 'backup_key_ciphertext_base64',
        passwordDerivationParams: {
            algorithm: 'argon2id13',
            salt: 'some_salt_base64',
            opsLimit: 2,
            memLimit: 67108864,
            parallelism: 1,
            hashLength: 32,
            verificator: 'dGhpcyBpcyBhIHZlcmlmaWVy'
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

    beforeAll(async () => {
        await mongoose.connection.collection('users').deleteMany({});
        testUser = await createVerifiedUser({ username: 'backupUser', email: 'backup@example.com' });
        testUserToken = generateUserToken(testUser);
    });

    beforeEach(async () => {
        await User.findByIdAndUpdate(testUser._id, { $unset: { 'backup': "" } });
    });

    describe('POST /api/backups', () => {
        it('should save backup successfully', async () => {
            const res = await request(app)
                .post('/api/backups')
                .set('Authorization', `Bearer ${testUserToken}`)
                .send(validBackupData);

            expect(res.statusCode).toBe(200);
            
            const userInDb = await User.findById(testUser._id).select('+backup');
            expect(userInDb.backup.publicKey).toBe(validBackupData.publicKey);
            expect(userInDb.backup.encryptedPrivateKey).toBe(validBackupData.encryptedPrivateKey);
            expect(userInDb.backup.passwordDerivationParams.verificator).toBe(validBackupData.passwordDerivationParams.verificator);
        });

        it('should reject unauthenticated requests', async () => {
            const res = await request(app)
                .post('/api/backups')
                .send(validBackupData);
            
            expect(res.statusCode).toBe(401);
        });

        it('should validate missing fields', async () => {
            const invalidData = { ...validBackupData };
            delete invalidData.encryptedPrivateKey;

            const res = await request(app)
                .post('/api/backups')
                .set('Authorization', `Bearer ${testUserToken}`)
                .send(invalidData);

            expect(res.statusCode).toBe(400);
        });

        it('should overwrite existing backup', async () => {
            await request(app)
                .post('/api/backups')
                .set('Authorization', `Bearer ${testUserToken}`)
                .send(validBackupData);

            const newBackupData = { ...validBackupData, encryptedPrivateKey: 'new_key_data' };

            const res = await request(app)
                .post('/api/backups')
                .set('Authorization', `Bearer ${testUserToken}`)
                .send(newBackupData);

            expect(res.statusCode).toBe(200);
            const userInDb = await User.findById(testUser._id).select('+backup');
            expect(userInDb.backup.encryptedPrivateKey).toBe('new_key_data');
        });
    });

    describe('GET /api/backups', () => {
        it('should return backup data', async () => {
            await request(app).post('/api/backups').set('Authorization', `Bearer ${testUserToken}`).send(validBackupData);

            const res = await request(app)
                .get('/api/backups')
                .set('Authorization', `Bearer ${testUserToken}`);

            expect(res.statusCode).toBe(200);
            expect(res.body.encryptedPrivateKey).toBe(validBackupData.encryptedPrivateKey);
        });

        it('should return 404 if backup does not exist', async () => {
            const res = await request(app)
                .get('/api/backups')
                .set('Authorization', `Bearer ${testUserToken}`);

            expect(res.statusCode).toBe(404);
        });
    });

    describe('POST /api/backups/verify-password', () => {
        beforeEach(async () => {
            await request(app).post('/api/backups').set('Authorization', `Bearer ${testUserToken}`).send(validBackupData);
        });

        it('should validate correct password verifier', async () => {
            const res = await request(app)
                .post('/api/backups/verify-password')
                .set('Authorization', `Bearer ${testUserToken}`)
                .send({ passwordVerifier: validBackupData.passwordDerivationParams.verificator });

            expect(res.statusCode).toBe(200);
            expect(res.body.valid).toBe(true);
        });

        it('should reject incorrect password verifier', async () => {
            const res = await request(app)
                .post('/api/backups/verify-password')
                .set('Authorization', `Bearer ${testUserToken}`)
                .send({ passwordVerifier: 'wrong_verifier_base64' });

            expect(res.statusCode).toBe(400);
            expect(res.body.valid).toBe(false);
        });

        it('should return 404 if backup missing', async () => {
            await User.findByIdAndUpdate(testUser._id, { $unset: { 'backup': "" } });
            
            const res = await request(app)
                .post('/api/backups/verify-password')
                .set('Authorization', `Bearer ${testUserToken}`)
                .send({ passwordVerifier: 'any' });

            expect(res.statusCode).toBe(404);
        });
    });

    describe('PUT /api/backups/password', () => {
        beforeEach(async () => {
             await request(app).post('/api/backups').set('Authorization', `Bearer ${testUserToken}`).send(validBackupData);
        });

        it('should update password-related fields', async () => {
            const updateData = {
                encryptedBackupKey: 'new_backup_key',
                passwordDerivationParams: {
                    ...validBackupData.passwordDerivationParams,
                    salt: 'new_salt',
                    verificator: 'new_verifier'
                },
                backupEncryptionParams: {
                    ...validBackupData.backupEncryptionParams,
                    iv: 'new_iv'
                }
            };

            const res = await request(app)
                .put('/api/backups/password')
                .set('Authorization', `Bearer ${testUserToken}`)
                .send(updateData);

            expect(res.statusCode).toBe(200);

            const userInDb = await User.findById(testUser._id).select('+backup');
            expect(userInDb.backup.encryptedBackupKey).toBe('new_backup_key');
            expect(userInDb.backup.passwordDerivationParams.verificator).toBe('new_verifier');
            // Private key should remain unchanged
            expect(userInDb.backup.encryptedPrivateKey).toBe(validBackupData.encryptedPrivateKey);
        });

        it('should return 404 if no backup exists', async () => {
            await User.findByIdAndUpdate(testUser._id, { $unset: { backup: "" } });

            const res = await request(app)
                .put('/api/backups/password')
                .set('Authorization', `Bearer ${testUserToken}`)
                .send({
                    encryptedBackupKey: 'val',
                    passwordDerivationParams: validBackupData.passwordDerivationParams,
                    backupEncryptionParams: validBackupData.backupEncryptionParams
                });

            expect(res.statusCode).toBe(404);
        });
    });
});