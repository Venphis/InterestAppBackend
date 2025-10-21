const fs = require('fs').promises;
const path = require('path');
const forge = require('node-forge');

const CA_DIR = path.join(__dirname, '../ca');
const CA_KEY_FILE = path.join(CA_DIR, 'ca.key.pem');
const CA_CERT_FILE = path.join(CA_DIR, 'ca.cert.pem');
const ISSUED_FILE = path.join(CA_DIR, 'issued.json');

async function ensureCA() {
  try {
    await fs.mkdir(CA_DIR, { recursive: true });
    const [keyPem, certPem] = await Promise.all([
      fs.readFile(CA_KEY_FILE, 'utf8'),
      fs.readFile(CA_CERT_FILE, 'utf8'),
    ]);
    return { key: forge.pki.privateKeyFromPem(keyPem), cert: forge.pki.certificateFromPem(certPem), certPem };
  } catch {
    const keys = forge.pki.rsa.generateKeyPair(4096);
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = String(Date.now());
    const now = new Date();
    cert.validity.notBefore = now;
    cert.validity.notAfter = new Date(now.setFullYear(now.getFullYear() + 10));
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
    return JSON.parse(await fs.readFile(ISSUED_FILE, 'utf8'));
  } catch {
    return {};
  }
}

async function saveIssued(data) {
  await fs.writeFile(ISSUED_FILE, JSON.stringify(data, null, 2), { mode: 0o600 });
}

exports.issueCertificate = async (req, res) => {
  const { csrPem } = req.body;
  const userId = req.user.email // email distinguishes individual users
  if (!csrPem) {
    return res.status(400).json({ error: 'Missing csrPem' });
  }
  if (!req.user || req.user.email !== userId) {
    return res.status(403).json({ error: 'Unauthorized certificate request' });
  }

  try {
    const csr = forge.pki.certificationRequestFromPem(csrPem);
    if (!csr.verify()) return res.status(400).json({ error: 'CSR verification failed' });

    const cn = csr.subject.getField('CN');
    if (!cn || cn.value !== userId) {
      return res.status(400).json({ error: 'CSR CN must match userId' });
    }

    const { key: caKey, cert: caCert, certPem: caCertPem } = await ensureCA();
    const issued = await loadIssued();
    // Check if a certificate already exists for this user
    if (issued[userId]) {
      try {
        const existingCert = forge.pki.certificateFromPem(issued[userId].certPem);
        const now = new Date();

        // If certificate is still valid, block issuance
        if (now >= existingCert.validity.notBefore && now <= existingCert.validity.notAfter) {
          // the certificate exists and is valid, so return it
          return res.status(200).json({
            certPem: issued[userId].certPem,
            caCertPem
          });
        }

        // Otherwise, allow renewal (overwrite old entry)
      } catch {
        console.warn(`Could not parse existing certificate for ${userId}, reissuing.`);
      }
    }

    const cert = forge.pki.createCertificate();
    cert.publicKey = csr.publicKey;
    cert.serialNumber = String(Date.now());
    const now = new Date();
    cert.validity.notBefore = now;
    cert.validity.notAfter = new Date(now.setFullYear(now.getFullYear() + 1));
    cert.setSubject(csr.subject.attributes);
    cert.setIssuer(caCert.subject.attributes);
    cert.sign(caKey, forge.md.sha256.create());

    const certPem = forge.pki.certificateToPem(cert);
    issued[userId] = { issuedAt: new Date().toISOString(), serial: cert.serialNumber, certPem };
    await saveIssued(issued);

    return res.status(201).json({ certPem, caCertPem });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to issue certificate' });
  }
};
