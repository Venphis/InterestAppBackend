// controllers/certificateController.js
const fs = require('fs').promises;
const path = require('path');
const forge = require('node-forge');
const crypto = require('crypto');

const CA_DIR = path.join(__dirname, '../ca');
const CA_KEY_FILE = path.join(CA_DIR, 'ca.key.pem');
const CA_CERT_FILE = path.join(CA_DIR, 'ca.cert.pem');
const ISSUED_FILE = path.join(CA_DIR, 'issued.json');

// --- PRZYWRÓCONE FUNKCJE POMOCNICZE ---
async function ensureCA() {
  try {
    // Upewnij się, że folder istnieje
    await fs.mkdir(CA_DIR, { recursive: true });
    // Spróbuj odczytać istniejące pliki
    const [keyPem, certPem] = await Promise.all([
      fs.readFile(CA_KEY_FILE, 'utf8'),
      fs.readFile(CA_CERT_FILE, 'utf8'),
    ]);
    return { key: forge.pki.privateKeyFromPem(keyPem), cert: forge.pki.certificateFromPem(certPem), certPem };
  } catch (readError) {
    // Jeśli odczyt się nie powiedzie, stwórz nowe CA
    const keys = forge.pki.rsa.generateKeyPair(4096);
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = '01' + crypto.randomBytes(19).toString('hex'); // Bardziej unikalny numer seryjny
    const now = new Date();
    cert.validity.notBefore = now;
    const notAfter = new Date();
    notAfter.setFullYear(notAfter.getFullYear() + 10); // Ważność na 10 lat
    cert.validity.notAfter = notAfter;
    const attrs = [
      { name: 'commonName', value: 'HelloBeaconCA' },
      { name: 'organizationName', value: 'HelloBeacon' },
    ];
    cert.setSubject(attrs);
    cert.setIssuer(attrs);
    cert.setExtensions([{ name: 'basicConstraints', cA: true }]);
    cert.sign(keys.privateKey, forge.md.sha256.create());

    const keyPem = forge.pki.privateKeyToPem(keys.privateKey);
    const certPem = forge.pki.certificateToPem(cert);
    await fs.writeFile(CA_KEY_FILE, keyPem, { mode: 0o600 });
    await fs.writeFile(CA_CERT_FILE, certPem);
    return { key: keys.privateKey, cert, certPem };
  }
}

async function loadIssued() {
  try {
    const data = await fs.readFile(ISSUED_FILE, 'utf8');
    return JSON.parse(data);
  } catch {
    return {}; // Zwróć pusty obiekt, jeśli plik nie istnieje
  }
}

async function saveIssued(data) {
  await fs.writeFile(ISSUED_FILE, JSON.stringify(data, null, 2), { mode: 0o600 });
}
// --- KONIEC PRZYWRÓCONYCH FUNKCJI ---


exports.issueCertificate = async (req, res, next) => { // Dodano next
  const { csrPem } = req.body;
  const userId = req.user.email;
  if (!csrPem) {
    return res.status(400).json({ error: 'Missing csrPem' });
  }

  try {
    const csr = forge.pki.certificationRequestFromPem(csrPem);
    if (!csr.verify()) {
        return res.status(400).json({ error: 'CSR verification failed' });
    }

    const cn = csr.subject.getField('CN');
    if (!cn || cn.value !== userId) {
      return res.status(400).json({ error: 'CSR CN must match userId' });
    }

    const { key: caKey, cert: caCert, certPem: caCertPem } = await ensureCA(); // Teraz ensureCA jest zdefiniowane
    const issued = await loadIssued();

    if (issued[userId] && issued[userId].certPem) {
      try {
        const existingCert = forge.pki.certificateFromPem(issued[userId].certPem);
        const now = new Date();
        if (now >= existingCert.validity.notBefore && now <= existingCert.validity.notAfter) {
          return res.status(200).json({
            certPem: issued[userId].certPem,
            caCertPem
          });
        }
        console.log(`Certificate for ${userId} has expired. Re-issuing.`);
      } catch (parseError) {
        console.warn(`Could not parse existing certificate for ${userId}, reissuing. Error:`, parseError.message);
      }
    }

    const cert = forge.pki.createCertificate();
    cert.publicKey = csr.publicKey;
    cert.serialNumber = '01' + crypto.randomBytes(19).toString('hex');
    const now = new Date();
    cert.validity.notBefore = now;
    const notAfter = new Date();
    notAfter.setFullYear(notAfter.getFullYear() + 1);
    cert.validity.notAfter = notAfter;

    cert.setSubject(csr.subject.attributes);
    cert.setIssuer(caCert.subject.attributes);
    cert.sign(caKey, forge.md.sha256.create());

    const certPem = forge.pki.certificateToPem(cert);
    issued[userId] = { issuedAt: new Date().toISOString(), serial: cert.serialNumber, certPem };
    await saveIssued(issued);

    return res.status(201).json({ certPem, caCertPem });
  } catch (e) {
    console.error("Certificate Issuance Error:", e);
    if (e.message && (e.message.includes('ASN.1') || e.message.includes('PEM'))) {
        return res.status(400).json({ error: `Failed to parse CSR: ${e.message}` });
    }
    // Przekaż inne błędy do globalnego error handlera
    next(e);
  }
};