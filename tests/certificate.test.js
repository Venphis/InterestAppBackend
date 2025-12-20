// tests/certificate.test.js
const request = require('supertest');
const app = require('../server');
const User = require('../models/User');
const { createVerifiedUser, generateUserToken } = require('./helpers/factories');
const mongoose = require('mongoose');
const forge = require('node-forge');
const fs = require('fs'); // Będziemy używać synchronicznych metod, aby uniknąć problemów w testach
const path = require('path');

function generateCsr(commonName) {
    const keys = forge.pki.rsa.generateKeyPair(2048);
    const csr = forge.pki.createCertificationRequest();
    csr.publicKey = keys.publicKey;
    csr.setSubject([{ name: 'commonName', value: commonName }]);
    csr.sign(keys.privateKey, forge.md.sha256.create());
    const csrPem = forge.pki.certificationRequestToPem(csr);
    return { csrPem, keys };
}

describe('Certificate API (/api/certificates)', () => {
    let testUser;
    let testUserToken;
    const caDir = path.join(__dirname, '..', 'ca');
    const issuedFilePath = path.join(caDir, 'issued.json'); // Ścieżka do pliku z wydanymi certyfikatami

    beforeAll(async () => {
        await mongoose.connection.collection('users').deleteMany({});
        if (fs.existsSync(caDir)) {
            fs.rmSync(caDir, { recursive: true, force: true });
        }
        testUser = await createVerifiedUser({
            username: 'certUser',
            email: 'cert@example.com'
        });
        testUserToken = generateUserToken(testUser);
    });

    beforeEach(() => {
        // Czyść plik z wydanymi certyfikatami przed każdym testem
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
            const res1 = await request(app)
                .post('/api/certificates/issue')
                .set('Authorization', `Bearer ${testUserToken}`)
                .send({ csrPem });
            expect(res1.statusCode).toEqual(201);
            const firstCertPem = res1.body.certPem;

            const res2 = await request(app)
                .post('/api/certificates/issue')
                .set('Authorization', `Bearer ${testUserToken}`)
                .send({ csrPem });

            expect(res2.statusCode).toEqual(200);
            expect(res2.body.certPem).toBe(firstCertPem);
        });

        // --- NOWY TEST DLA ODNAWIANIA WYGASŁEGO CERTYFIKATU ---
        it('should issue a NEW certificate (renew) if the existing one has expired', async () => {
            // Krok 1: Wygeneruj i wydaj pierwszy (stary) certyfikat
            const { csrPem } = generateCsr(testUser.email);
            const res1 = await request(app)
                .post('/api/certificates/issue')
                .set('Authorization', `Bearer ${testUserToken}`)
                .send({ csrPem });
            expect(res1.statusCode).toEqual(201);
            const oldCertPem = res1.body.certPem;

            // Krok 2: "Podróż w czasie" - zmodyfikuj datę ważności w zapisanym certyfikacie
            // Aby to zrobić, musimy zmodyfikować datę w certyfikacie PEM, co jest trudne.
            // PROSTSZE PODEJŚCIE: Stwórzmy ręcznie wygasły certyfikat i zapiszmy go w `issued.json`.

            // Wyczyść stan po pierwszym wydaniu
            if (fs.existsSync(issuedFilePath)) {
                fs.unlinkSync(issuedFilePath);
            }

            // Stwórz ręcznie wygasły certyfikat
            const keys = forge.pki.rsa.generateKeyPair(2048);
            const expiredCert = forge.pki.createCertificate();
            expiredCert.publicKey = keys.publicKey;
            expiredCert.serialNumber = '01';
            const pastDate = new Date();
            pastDate.setFullYear(pastDate.getFullYear() - 2); // Data w przeszłości
            const expiredDate = new Date();
            expiredDate.setFullYear(expiredDate.getFullYear() - 1); // Data w przeszłości
            expiredCert.validity.notBefore = pastDate;
            expiredCert.validity.notAfter = expiredDate;
            const attrs = [{ name: 'commonName', value: testUser.email }];
            expiredCert.setSubject(attrs);
            expiredCert.setIssuer(attrs); // W prostym teście, wystawca może być taki sam
            expiredCert.sign(keys.privateKey, forge.md.sha256.create());
            const expiredCertPem = forge.pki.certificateToPem(expiredCert);

            // Zapisz wygasły certyfikat do pliku, symulując, że został wydany dawno temu
            const issuedData = {
                [testUser.email]: {
                    issuedAt: pastDate.toISOString(),
                    serial: expiredCert.serialNumber,
                    certPem: expiredCertPem
                }
            };
            fs.writeFileSync(issuedFilePath, JSON.stringify(issuedData, null, 2));

            // Krok 3: Wyślij nowe żądanie CSR, aby odnowić certyfikat
            const { csrPem: newCsrPem } = generateCsr(testUser.email);
            const res2 = await request(app)
                .post('/api/certificates/issue')
                .set('Authorization', `Bearer ${testUserToken}`)
                .send({ csrPem: newCsrPem });

            // Oczekujemy, że serwer wyda NOWY certyfikat ze statusem 201
            expect(res2.statusCode).toEqual(201);
            const newCertPem = res2.body.certPem;

            // Upewnij się, że nowy certyfikat jest inny niż stary, wygasły
            expect(newCertPem).toBeDefined();
            expect(newCertPem).not.toBe(expiredCertPem);

            // Sprawdź datę ważności nowego certyfikatu
            const newCert = forge.pki.certificateFromPem(newCertPem);
            const now = new Date();
            // Sprawdź, czy `notAfter` jest w przyszłości (z małym marginesem na czas wykonania testu)
            expect(newCert.validity.notAfter.getTime()).toBeGreaterThan(now.getTime());
        });
    });
});