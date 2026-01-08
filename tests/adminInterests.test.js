const request = require('supertest');
const app = require('../server');
const mongoose = require('mongoose');
const Interest = require('../models/Interest');
const InterestCategory = require('../models/InterestCategory');
const { createSuperAdmin, createAdmin, createInterestCategory, createInterest } = require('./helpers/factories');

describe('Admin Interests API', () => {
    let superadminToken, adminToken;
    let testCategory;

    const rand = () => new mongoose.Types.ObjectId().toString().slice(-6);

    beforeAll(async () => {
        await mongoose.connection.collection('adminusers').deleteMany({});
        await mongoose.connection.collection('interestcategories').deleteMany({});
        await mongoose.connection.collection('interests').deleteMany({});

        const superadmin = await createSuperAdmin({ username: 'superadmin' });
        const res1 = await request(app).post('/api/admin/auth/login').send({ username: 'superadmin', password: 'superStrongPassword123!' });
        superadminToken = res1.body.token;

        const admin = await createAdmin({ username: 'admin' });
        const res2 = await request(app).post('/api/admin/auth/login').send({ username: 'admin', password: 'superStrongPassword123!' });
        adminToken = res2.body.token;

        testCategory = await createInterestCategory({ name: 'General Tech' });
    });

    describe('Category Management', () => {
        let catId;

        beforeEach(async () => {
            const cat = await createInterestCategory({ name: `Modifiable Cat ${rand()}` });
            catId = cat._id.toString();
        });

        it('should allow admin to create a category', async () => {
            const res = await request(app)
                .post('/api/admin/interests/categories')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ name: `New Cat ${rand()}`, description: 'Desc' });
            
            expect(res.statusCode).toBe(201);
            expect(res.body.name).toMatch(/New Cat/);
        });

        it('should prevent duplicate category names', async () => {
            const res = await request(app)
                .post('/api/admin/interests/categories')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ name: 'General Tech' }); 
            
            expect(res.statusCode).toBe(400);
        });

        it('should allow updating category', async () => {
            const res = await request(app)
                .put(`/api/admin/interests/categories/${catId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ name: 'Updated Name', description: 'New desc' });
            
            expect(res.statusCode).toBe(200);
            expect(res.body.name).toBe('Updated Name');
        });

        it('should allow deleting empty category', async () => {
            const res = await request(app)
                .delete(`/api/admin/interests/categories/${catId}`)
                .set('Authorization', `Bearer ${superadminToken}`);
            
            expect(res.statusCode).toBe(200);
            expect(await InterestCategory.findById(catId)).toBeNull();
        });

        it('should prevent deleting category with interests', async () => {
            await createInterest({ category: catId });
            const res = await request(app)
                .delete(`/api/admin/interests/categories/${catId}`)
                .set('Authorization', `Bearer ${superadminToken}`);
            
            expect(res.statusCode).toBe(400);
        });
    });

    describe('Interest Management', () => {
        let interest;

        beforeEach(async () => {
            interest = await createInterest({ name: `Interest ${rand()}`, category: testCategory });
        });

        it('should create interest with category', async () => {
            const res = await request(app)
                .post('/api/admin/interests')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ name: `New Interest ${rand()}`, categoryId: testCategory._id });
            
            expect(res.statusCode).toBe(201);
            expect(res.body.category._id).toBe(testCategory._id.toString());
        });

        it('should create interest without category', async () => {
            const res = await request(app)
                .post('/api/admin/interests')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ name: `Orphan Interest ${rand()}` });
            
            expect(res.statusCode).toBe(201);
            expect(res.body.category).toBeNull();
        });

        it('should list interests including archived if requested', async () => {
            await createInterest({ name: 'Archived One', category: testCategory, overrides: { isArchived: true } });
            
            const res = await request(app)
                .get('/api/admin/interests?showArchived=true')
                .set('Authorization', `Bearer ${adminToken}`);
            
            expect(res.statusCode).toBe(200);
            expect(res.body.interests.some(i => i.isArchived)).toBe(true);
        });

        it('should update interest fields', async () => {
            const res = await request(app)
                .put(`/api/admin/interests/${interest._id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ name: 'Updated Interest Name', isArchived: true });
            
            expect(res.statusCode).toBe(200);
            expect(res.body.name).toBe('Updated Interest Name');
            expect(res.body.isArchived).toBe(true);
        });

        it('should prevent duplicate active interest in same category', async () => {
            await createInterest({ name: 'Duplicate Me', category: testCategory });
            const res = await request(app)
                .post('/api/admin/interests')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ name: 'Duplicate Me', categoryId: testCategory._id });
            
            expect(res.statusCode).toBe(400);
        });
    });

    describe('I18n / Translations', () => {
        let cat, intr;

        beforeEach(async () => {
            cat = await createInterestCategory({ name: `Cat I18n ${rand()}` });
            intr = await createInterest({ name: `Intr I18n ${rand()}`, category: cat });
        });

        it('should upsert category translation', async () => {
            const res = await request(app)
                .patch(`/api/admin/interests/categories/${cat._id}/translations/pl`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ name: 'Kategoria PL' });
            
            expect(res.statusCode).toBe(200);
            
            // Verify public access
            const pub = await request(app).get(`/api/public/interests/categories?lang=pl`);
            const found = pub.body.find(c => c._id === cat._id.toString());
            expect(found.name).toBe('Kategoria PL');
        });

        it('should upsert interest translation', async () => {
            const res = await request(app)
                .patch(`/api/admin/interests/${intr._id}/translations/de`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ name: 'Interesse DE' });
            
            expect(res.statusCode).toBe(200);

            const pub = await request(app).get(`/api/public/interests?categoryId=${cat._id}&lang=de`);
            expect(pub.body[0].name).toBe('Interesse DE');
        });

        it('should fallback to default language if translation missing', async () => {
            const res = await request(app).get(`/api/public/interests?categoryId=${cat._id}&lang=fr`);
            expect(res.body[0].name).toBe(intr.name);
        });
    });
});