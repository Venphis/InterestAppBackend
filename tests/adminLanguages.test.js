const request = require('supertest');
const app = require('../server');
const mongoose = require('mongoose');
const Language = require('../models/Language');
const InterestCategory = require('../models/InterestCategory');
const Interest = require('../models/Interest');
const { createSuperAdmin, createAdmin, createInterestCategory, createInterest, createLanguage } = require('./helpers/factories');

describe('Admin Languages API', () => {
    let superadminToken, adminToken;

    const rand = () => new mongoose.Types.ObjectId().toString().slice(-6);

    const ensureDefaults = async () => {
        const defaults = [
            { code: 'en', name: 'English', nativeName: 'English' },
            { code: 'pl', name: 'Polski', nativeName: 'Polski' }
        ];
        
        await Promise.all(defaults.map(lang => 
            Language.updateOne({ code: lang.code }, { $setOnInsert: { ...lang, isArchived: false } }, { upsert: true })
        ));
    };

    beforeAll(async () => {
        await Language.deleteMany({ code: { $nin: ['en', 'pl'] } });
        await ensureDefaults();
        await mongoose.connection.collection('adminusers').deleteMany({});

        const superadmin = await createSuperAdmin({ username: 'superadmin' });
        const res1 = await request(app).post('/api/admin/auth/login').send({ username: 'superadmin', password: 'superStrongPassword123!' });
        superadminToken = res1.body.token;

        const admin = await createAdmin({ username: 'admin' });
        const res2 = await request(app).post('/api/admin/auth/login').send({ username: 'admin', password: 'superStrongPassword123!' });
        adminToken = res2.body.token;
    });

    describe('Default Constraints', () => {
        it('should prevent duplicate language codes', async () => {
            const res = await request(app)
                .post('/api/admin/languages')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ code: 'en', name: 'Duplicate' });
            
            expect([400, 409]).toContain(res.statusCode);
        });

        it('should prevent archiving default language (en)', async () => {
            const en = await Language.findOne({ code: 'en' });
            const res = await request(app)
                .put(`/api/admin/languages/${en._id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ isArchived: true });
            
            expect(res.statusCode).toBe(400);
            expect(res.body.message).toMatch(/cannot archive/i);
        });
    });

    describe('CRUD Operations', () => {
        it('should create a new language', async () => {
            const res = await request(app)
                .post('/api/admin/languages')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ code: 'fr', name: 'French', nativeName: 'Français' });
            
            expect(res.statusCode).toBe(201);
            expect(res.body.code).toBe('fr');
        });

        it('should list active languages', async () => {
            const res = await request(app)
                .get('/api/admin/languages')
                .set('Authorization', `Bearer ${adminToken}`);
            
            expect(res.statusCode).toBe(200);
            expect(res.body.map(l => l.code)).toEqual(expect.arrayContaining(['en', 'pl', 'fr']));
        });

        it('should update language details', async () => {
            const fr = await Language.findOne({ code: 'fr' });
            const res = await request(app)
                .put(`/api/admin/languages/${fr._id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ name: 'French Updated' });
            
            expect(res.statusCode).toBe(200);
            expect(res.body.name).toBe('French Updated');
        });

        it('should archive and restore language', async () => {
            const fr = await Language.findOne({ code: 'fr' });
            
            await request(app)
                .delete(`/api/admin/languages/${fr._id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);
            
            expect((await Language.findById(fr._id)).isArchived).toBe(true);

            await request(app)
                .put(`/api/admin/languages/${fr._id}/restore`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);
            
            expect((await Language.findById(fr._id)).isArchived).toBe(false);
        });
    });

    describe('Data Migration (i18n)', () => {
        it('should migrate i18n keys when language code changes', async () => {
            const de = await createLanguage({ code: 'de', name: 'German' });
            const cat = await createInterestCategory({ name: `Cat ${rand()}` });
            const intr = await createInterest({ name: `Intr ${rand()}`, category: cat });

            await InterestCategory.updateOne({ _id: cat._id }, { $set: { 'i18n.de': { name: 'DE Cat' } } });
            await Interest.updateOne({ _id: intr._id }, { $set: { 'i18n.de': { name: 'DE Intr' } } });

            await request(app)
                .put(`/api/admin/languages/${de._id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ code: 'de-at' })
                .expect(200);

            const updatedCat = await InterestCategory.findById(cat._id).lean();
            const updatedIntr = await Interest.findById(intr._id).lean();

            expect(updatedCat.i18n['de']).toBeUndefined();
            expect(updatedCat.i18n['de-at'].name).toBe('DE Cat');

            expect(updatedIntr.i18n['de']).toBeUndefined();
            expect(updatedIntr.i18n['de-at'].name).toBe('DE Intr');
        });
    });
});