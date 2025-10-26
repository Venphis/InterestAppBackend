// tests/certificate.test.js
const request = require('supertest');
const app = require('../server');
const User = require('../models/User');
const { createVerifiedUser, generateUserToken } = require('./helpers/factories');
const mongoose = require('mongoose');
const forge = require('node-forge'); // Ta sama biblioteka, co w kontrolerze
const fs = require('fs');
const path = require('path');

// Funkcja pomocnicza do generowania pary kluczy i CSR
function generateCsr(commonName) {
    const keys = forge.pki.rsa.generateKeyPair(2048);
    const csr = forge.pki.createCertificationRequest();
    csr.publicKey = keys.publicKey;
    csr.setSubject([{ name: 'commonName', value: commonName }]);
    // Możesz dodać inne atrybuty, jeśli są wymagane/weryfikowane
    csr.sign(keys.privateKey, forge.md.sha256.create());
    const csrPem = forge.pki.certificationRequestToPem(csr);
    return { csrPem, keys }; // Zwracamy też klucze na potrzeby testów
}

describe('Certificate API (/api/certificates)', () => {
    let testUser;
    let testUserToken;
    const caDir = path.join(__dirname, '..', 'ca'); // Ścieżka do folderu CA

    beforeAll(async () => {
        // Wyczyść kolekcję użytkowników
        await mongoose.connection.collection('users').deleteMany({});
        // Wyczyść folder CA przed uruchomieniem testów, aby zapewnić świeży start
        if (fs.existsSync(caDir)) {
            fs.rmSync(caDir, { recursive: true, force: true });
        }

        testUser = await createVerifiedUser({
            username: 'certUser',
            email: 'cert@example.com'
        });
        testUserToken = generateUserToken(testUser);
    });

    // Wyczyść plik z wydanymi certyfikatami przed każdym testem
    beforeEach(() => {
        const issuedFilePath = path.join(caDir, 'issued.json');
        if (fs.existsSync(issuedFilePath)) {
            fs.unlinkSync(issuedFilePath);
        }
    });

    describe('POST /api/certificates/issue', () => {
        it('should issue a new certificate for a valid CSR', async () => {
            const { csrPem } = generateCsr(testUser.email); // CN musi pasować do emaila użytkownika

            const res = await request(app)
                .post('/api/certificates/issue')
                .set('Authorization', `Bearer ${testUserToken}`)
                .send({ csrPem });

            expect(res.statusCode).toEqual(201);
            expect(res.body).toHaveProperty('certPem');
            expect(res.body).toHaveProperty('caCertPem');
            expect(res.body.certPem).toContain('-----BEGIN CERTIFICATE-----');
            expect(res.body.caCertPem).toContain('-----BEGIN CERTIFICATE-----');

            // Opcjonalnie: zweryfikuj wydany certyfikat
            const cert = forge.pki.certificateFromPem(res.body.certPem);
            expect(cert.subject.getField('CN').value).toBe(testUser.email);
        });

        it('should not issue a certificate if not authenticated', async () => {
            const { csrPem } = generateCsr(testUser.email);
            const res = await request(app)
                .post('/api/certificates/issue')
                // Brak nagłówka Authorization
                .send({ csrPem });
            expect(res.statusCode).toEqual(401);
        });

        it('should not issue a certificate if CSR is missing', async () => {
            const res = await request(app)
                .post('/api/certificates/issue')
                .set('Authorization', `Bearer ${testUserToken}`)
                .send({}); // Puste body
            expect(res.statusCode).toEqual(400);
            expect(res.body).toHaveProperty('error', 'Missing csrPem');
        });

        it('should not issue a certificate if CSR verification fails (e.g., corrupted)', async () => {
        // Wycisz console.error na czas tego testu
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        const corruptedCsrPem = '-----BEGIN CERTIFICATE REQUEST-----\ninvaliddata\n-----END CERTIFICATE REQUEST-----';
        const res = await request(app)
            .post('/api/certificates/issue')
            .set('Authorization', `Bearer ${testUserToken}`)
            .send({ csrPem: corruptedCsrPem });

        expect(res.statusCode).toEqual(400); // Kontroler powinien zwrócić 400
        expect(res.body).toHaveProperty('error');
        expect(res.body.error).toContain('Failed to parse CSR');

        // Przywróć oryginalną implementację console.error
        consoleErrorSpy.mockRestore();
        });

        it('should not issue a certificate if CSR Common Name (CN) does not match user email', async () => {
            const { csrPem } = generateCsr('wrong@email.com'); // Zły CN
            const res = await request(app)
                .post('/api/certificates/issue')
                .set('Authorization', `Bearer ${testUserToken}`)
                .send({ csrPem });
            expect(res.statusCode).toEqual(400);
            expect(res.body).toHaveProperty('error', 'CSR CN must match userId');
        });

        it('should return an existing valid certificate if one has already been issued', async () => {
            const { csrPem } = generateCsr(testUser.email);

            // Pierwsze żądanie - wydanie certyfikatu
            const res1 = await request(app)
                .post('/api/certificates/issue')
                .set('Authorization', `Bearer ${testUserToken}`)
                .send({ csrPem });
            expect(res1.statusCode).toEqual(201);
            const firstCertPem = res1.body.certPem;

            // Drugie żądanie - powinno zwrócić ten sam (lub istniejący) certyfikat
            const res2 = await request(app)
                .post('/api/certificates/issue')
                .set('Authorization', `Bearer ${testUserToken}`)
                .send({ csrPem }); // Wyślij ten sam lub nowy CSR

            expect(res2.statusCode).toEqual(200); // Oczekujemy 200 OK
            expect(res2.body.certPem).toBe(firstCertPem);
        });
    });
});