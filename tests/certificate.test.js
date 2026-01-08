const request = require('supertest');
const app = require('../server');
const mongoose = require('mongoose');
const forge = require('node-forge');
const fs = require('fs');
const path = require('path');
const { createVerifiedUser, generateUserToken } = require('./helpers/factories');

function generateCsr(commonName) {
    const keys = forge.pki.rsa.generateKeyPair(2048);
    const csr = forge.pki.createCertificationRequest();
    csr.publicKey = keys.publicKey;
    csr.setSubject([{ name: 'commonName', value: commonName }]);
    csr.sign(keys.privateKey, forge.md.sha256.create());
    return { csrPem: forge.pki.certificationRequestToPem(csr), keys };
}

describe('Certificate API (/api/certificates)', () => {
    let testUser, testUserToken;
    const caDir = path.join(__dirname, '..', 'ca');
    const issuedFilePath = path.join(caDir, 'issued.json');

    beforeAll(async () => {
        await mongoose.connection.collection('users').deleteMany({});
        
        if (fs.existsSync(caDir)) fs.rmSync(caDir, { recursive: true, force: true });

        testUser = await createVerifiedUser({ username: 'certUser', email: 'cert@example.com' });
        testUserToken = generateUserToken(testUser);
    });

    beforeEach(() => {
        if (fs.existsSync(issuedFilePath)) fs.unlinkSync(issuedFilePath);
    });

    describe('POST /api/certificates/issue', () => {
        it('should issue a new certificate for valid CSR', async () => {
            const { csrPem } = generateCsr(testUser.email);

            const res = await request(app)
                .post('/api/certificates/issue')
                .set('Authorization', `Bearer ${testUserToken}`)
                .send({ csrPem });

            expect(res.statusCode).toBe(201);
            expect(res.body.certPem).toContain('-----BEGIN CERTIFICATE-----');
            
            const cert = forge.pki.certificateFromPem(res.body.certPem);
            expect(cert.subject.getField('CN').value).toBe(testUser.email);
        });

        it('should reject unauthenticated request', async () => {
            const { csrPem } = generateCsr(testUser.email);
            const res = await request(app)
                .post('/api/certificates/issue')
                .send({ csrPem });
            
            expect(res.statusCode).toBe(401);
        });

        it('should validate missing CSR', async () => {
            const res = await request(app)
                .post('/api/certificates/issue')
                .set('Authorization', `Bearer ${testUserToken}`)
                .send({});
            
            expect(res.statusCode).toBe(400);
        });

        it('should reject corrupted CSR', async () => {
            const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

            const res = await request(app)
                .post('/api/certificates/issue')
                .set('Authorization', `Bearer ${testUserToken}`)
                .send({ csrPem: '-----BEGIN CERTIFICATE REQUEST-----\ninvalid\n-----END CERTIFICATE REQUEST-----' });

            expect(res.statusCode).toBe(400);
            expect(res.body.error).toMatch(/Failed to parse CSR/);
            
            spy.mockRestore();
        });

        it('should reject CSR if CN does not match email', async () => {
            const { csrPem } = generateCsr('wrong@email.com');
            const res = await request(app)
                .post('/api/certificates/issue')
                .set('Authorization', `Bearer ${testUserToken}`)
                .send({ csrPem });
            
            expect(res.statusCode).toBe(400);
            expect(res.body.error).toMatch(/CN.*must match/);
        });

        it('should return existing valid certificate', async () => {
            const { csrPem } = generateCsr(testUser.email);
            
            const res1 = await request(app)
                .post('/api/certificates/issue')
                .set('Authorization', `Bearer ${testUserToken}`)
                .send({ csrPem });
            
            const res2 = await request(app)
                .post('/api/certificates/issue')
                .set('Authorization', `Bearer ${testUserToken}`)
                .send({ csrPem });

            expect(res2.statusCode).toBe(200);
            expect(res2.body.certPem).toBe(res1.body.certPem);
        });

        it('should renew expired certificate', async () => {
            if (fs.existsSync(issuedFilePath)) fs.unlinkSync(issuedFilePath);

            const keys = forge.pki.rsa.generateKeyPair(2048);
            const expiredCert = forge.pki.createCertificate();
            expiredCert.publicKey = keys.publicKey;
            expiredCert.serialNumber = '01';
            
            const past = new Date();
            past.setFullYear(past.getFullYear() - 2);
            expiredCert.validity.notBefore = past;
            expiredCert.validity.notAfter = new Date(past.getFullYear() + 1);
            
            expiredCert.setSubject([{ name: 'commonName', value: testUser.email }]);
            expiredCert.sign(keys.privateKey, forge.md.sha256.create());

            fs.writeFileSync(issuedFilePath, JSON.stringify({
                [testUser.email]: {
                    issuedAt: past.toISOString(),
                    serial: '01',
                    certPem: forge.pki.certificateToPem(expiredCert)
                }
            }));

            const { csrPem } = generateCsr(testUser.email);
            const res = await request(app)
                .post('/api/certificates/issue')
                .set('Authorization', `Bearer ${testUserToken}`)
                .send({ csrPem });

            expect(res.statusCode).toBe(201);
            expect(res.body.certPem).not.toBe(forge.pki.certificateToPem(expiredCert));
            
            const newCert = forge.pki.certificateFromPem(res.body.certPem);
            expect(newCert.validity.notAfter.getTime()).toBeGreaterThan(Date.now());
        });
    });
});