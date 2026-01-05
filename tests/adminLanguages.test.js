const request = require('supertest');
const app = require('../server');
const mongoose = require('mongoose');

const Language = require('../models/Language');
const Interest = require('../models/Interest');
const InterestCategory = require('../models/InterestCategory');

const { createSuperAdmin, createAdmin, createInterestCategory, createInterest } = require('./helpers/factories');

describe('Admin Languages API', () => {
  let superadminToken;
  let adminToken;

  const rand = () => new mongoose.Types.ObjectId().toString().slice(-6);

  const ensureDefaultLanguagesExist = async () => {
  await Language.updateOne(
    { code: 'en' },
    { $setOnInsert: { code: 'en', name: 'English', nativeName: 'English', isArchived: false } },
    { upsert: true }
  );

  await Language.updateOne(
    { code: 'pl' },
    { $setOnInsert: { code: 'pl', name: 'Polski', nativeName: 'Polski', isArchived: false } },
    { upsert: true }
  );
};

  beforeAll(async () => {
    // Czyścimy tylko testowe kody, nie całą kolekcję
    await Language.deleteMany({ code: { $in: ['en', 'en-us', 'de', 'xx', 'zz', 'qq'] } });

    await ensureDefaultLanguagesExist();

    await mongoose.connection.collection('adminusers').deleteMany({});

    await createSuperAdmin({ username: 'langSuperAdmin' });
    let res = await request(app)
      .post('/api/admin/auth/login')
      .send({ username: 'langSuperAdmin', password: 'superStrongPassword123!' });
    expect(res.statusCode).toBe(200);
    superadminToken = res.body.token;

    await createAdmin({ username: 'langAdmin' });
    res = await request(app)
      .post('/api/admin/auth/login')
      .send({ username: 'langAdmin', password: 'superStrongPassword123!' });
    expect(res.statusCode).toBe(200);
    adminToken = res.body.token;
  });

  describe('Default language "en"', () => {
    it('should have English language (en) present and should not allow duplicate code', async () => {
      await ensureDefaultLanguagesExist();

      const en = await Language.findOne({ code: 'en' }).lean();
      expect(en).toBeTruthy();
      expect(en.code).toBe('en');

      const res = await request(app)
        .post('/api/admin/languages')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ code: 'en', name: 'English 2', nativeName: 'English' });

      expect([400, 409]).toContain(res.statusCode);
    });
  });

  describe('GET /api/admin/languages', () => {
    it('should list active (non-archived) languages', async () => {
      await ensureDefaultLanguagesExist();

      await Language.deleteMany({ code: 'en' });
      await Language.create({ code: 'en', name: 'English', nativeName: 'English', isArchived: false });

      const res = await request(app)
        .get('/api/admin/languages')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);

      const codes = res.body.map(l => l.code);
      expect(codes).toContain('pl');
      expect(codes).toContain('en');
    });

    it('should list all languages when showArchived=true', async () => {
      await Language.deleteMany({ code: 'de' });
      await Language.create({ code: 'de', name: 'German', nativeName: 'Deutsch', isArchived: true });

      const res = await request(app)
        .get('/api/admin/languages?showArchived=true')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      const codes = res.body.map(l => l.code);
      expect(codes).toContain('de');
    });
  });

  describe('POST /api/admin/languages', () => {
    it('should allow admin to create a language', async () => {
      await Language.deleteMany({ code: 'xx' });

      const res = await request(app)
        .post('/api/admin/languages')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ code: 'xx', name: 'TestLang', nativeName: 'TestLang' });

      expect(res.statusCode).toBe(201);
      expect(res.body.code).toBe('xx');
      expect(res.body.name).toBe('TestLang');
      expect(res.body.isArchived).toBe(false);
    });

    it('should reject invalid language code', async () => {
      const res = await request(app)
        .post('/api/admin/languages')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ code: 'english', name: 'English', nativeName: 'English' });

      expect(res.statusCode).toBe(400);
      expect(res.body).toHaveProperty('errors');
    });

    it('should reject duplicate language code', async () => {
      await Language.deleteMany({ code: 'zz' });
      await Language.create({ code: 'zz', name: 'Zed', nativeName: 'Zed', isArchived: false });

      const res = await request(app)
        .post('/api/admin/languages')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ code: 'zz', name: 'Zed2', nativeName: 'Zed2' });

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toMatch(/already exists/i);
    });
  });

  describe('GET /api/admin/languages/:languageId', () => {
    it('should fetch single language by id', async () => {
      // valid code: 2-3 litery
      await Language.deleteMany({ code: 'qq' });
      const lang = await Language.create({ code: 'qq', name: 'Temp', nativeName: 'Temp', isArchived: false });

      const res = await request(app)
        .get(`/api/admin/languages/${lang._id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body._id.toString()).toBe(lang._id.toString());
      expect(res.body.code).toBe('qq');
    });

    it('should return 404 for not found', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .get(`/api/admin/languages/${fakeId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(404);
    });
  });

  describe('PUT /api/admin/languages/:languageId', () => {
    it('should update name/nativeName', async () => {
      await Language.deleteMany({ code: 'de' });
      const lang = await Language.create({ code: 'de', name: 'German', nativeName: 'Deutsch', isArchived: false });

      const res = await request(app)
        .put(`/api/admin/languages/${lang._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Deutsch (Updated)', nativeName: 'Deutsch' });

      expect(res.statusCode).toBe(200);
      expect(res.body.name).toBe('Deutsch (Updated)');
    });

    it('should prevent archiving default language en', async () => {
      await ensureDefaultLanguagesExist();

      const en = await Language.findOne({ code: 'en' });
      expect(en).toBeTruthy();

      const res = await request(app)
        .put(`/api/admin/languages/${en._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isArchived: true });

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toMatch(/cannot archive/i);

      const enAfter = await Language.findById(en._id).lean();
      expect(enAfter.isArchived).toBe(false);
    });


    it('should migrate i18n keys in Interest & Category when code changes (de -> de-at)', async () => {
      await ensureDefaultLanguagesExist();

      await Language.deleteMany({ code: { $in: ['de', 'de-at'] } });
      const de = await Language.create({ code: 'de', name: 'German', nativeName: 'Deutsch', isArchived: false });

      const cat = await createInterestCategory({ name: `Some EN Cat ${rand()}`, description: 'EN base desc' });
      const intr = await createInterest({ name: `Some EN Interest ${rand()}`, category: cat, description: 'EN base interest desc' });

      // ustaw i18n.de
      const catDoc = await InterestCategory.findById(cat._id);
      catDoc.i18n = catDoc.i18n || new Map();
      catDoc.i18n.set('de', { name: 'Kategorie DE', description: 'DE beschreibung' });
      await catDoc.save();

      const intrDoc = await Interest.findById(intr._id);
      intrDoc.i18n = intrDoc.i18n || new Map();
      intrDoc.i18n.set('de', { name: 'Interesse DE', description: 'DE interesse beschreibung' });
      await intrDoc.save();

      const res = await request(app)
        .put(`/api/admin/languages/${de._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ code: 'de-at', name: 'German (AT)' });

      expect(res.statusCode).toBe(200);
      expect(res.body.code).toBe('de-at');

      const catAfter = await InterestCategory.findById(cat._id).lean();
      expect(catAfter.i18n['de-at']).toBeTruthy();
      expect(catAfter.i18n['de-at'].name).toBe('Kategorie DE');
      expect(catAfter.i18n['de']).toBeUndefined();

      const intrAfter = await Interest.findById(intr._id).lean();
      expect(intrAfter.i18n['de-at']).toBeTruthy();
      expect(intrAfter.i18n['de-at'].name).toBe('Interesse DE');
      expect(intrAfter.i18n['de']).toBeUndefined();
    });
  });

  describe('DELETE /api/admin/languages/:languageId (archive) + restore', () => {
    it('should archive and restore language', async () => {
      await Language.deleteMany({ code: 'xx' });
      const lang = await Language.create({ code: 'xx', name: 'ToArchive', nativeName: 'ToArchive', isArchived: false });

      const del = await request(app)
        .delete(`/api/admin/languages/${lang._id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(del.statusCode).toBe(200);
      expect(del.body.message).toMatch(/archived/i);

      const inDb = await Language.findById(lang._id).lean();
      expect(inDb.isArchived).toBe(true);

      const restore = await request(app)
        .put(`/api/admin/languages/${lang._id}/restore`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(restore.statusCode).toBe(200);

      const inDb2 = await Language.findById(lang._id).lean();
      expect(inDb2.isArchived).toBe(false);
    });
  });
});
