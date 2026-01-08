const request = require('supertest');
const app = require('../server');
const mongoose = require('mongoose');
const InterestCategory = require('../models/InterestCategory');
const Interest = require('../models/Interest');
const { createInterestCategory, createInterest } = require('./helpers/factories');

describe('Public Interest API', () => {
    let catTech, catBooks, catI18n;
    let intNode, intReact, intSciFi, intI18n;

    beforeAll(async () => {
        await mongoose.connection.collection('interestcategories').deleteMany({});
        await mongoose.connection.collection('interests').deleteMany({});

        catTech = await createInterestCategory({ name: 'Technology' });
        catBooks = await createInterestCategory({ name: 'Books' });
        
        intNode = await createInterest({ name: 'Node.js', category: catTech });
        intReact = await createInterest({ name: 'React', category: catTech });
        intSciFi = await createInterest({ name: 'SciFi', category: catBooks });
        await createInterest({ name: 'Archived Fantasy', category: catBooks, overrides: { isArchived: true } });

        catI18n = await createInterestCategory({ name: 'Category EN', description: 'Desc EN' });
        intI18n = await createInterest({ name: 'Interest EN', category: catI18n });

        await InterestCategory.updateOne({ _id: catI18n._id }, { $set: { 'i18n.pl': { name: 'Kategoria PL', description: 'Opis PL' } } });
        await Interest.updateOne({ _id: intI18n._id }, { $set: { 'i18n.pl': { name: 'Zainteresowanie PL' } } });
    });

    describe('GET /api/public/interests/categories', () => {
        it('should list all categories', async () => {
            const res = await request(app).get('/api/public/interests/categories');
            
            expect(res.statusCode).toBe(200);
            expect(res.body).toHaveLength(3);
            expect(res.body.map(c => c.name)).toContain('Technology');
        });

        it('should localize categories (PL)', async () => {
            const res = await request(app).get('/api/public/interests/categories?lang=pl');
            
            const cat = res.body.find(c => c._id === catI18n._id.toString());
            expect(cat.name).toBe('Kategoria PL');
        });
    });

    describe('GET /api/public/interests', () => {
        it('should list active interests', async () => {
            const res = await request(app).get('/api/public/interests');
            
            expect(res.statusCode).toBe(200);
            expect(res.body.some(i => i.name === 'Node.js')).toBe(true);
            expect(res.body.some(i => i.isArchived)).toBe(false);
        });

        it('should filter by category', async () => {
            const res = await request(app).get(`/api/public/interests?categoryId=${catTech._id}`);
            
            expect(res.statusCode).toBe(200);
            expect(res.body).toHaveLength(2); 
        });

        it('should search by name', async () => {
            const res = await request(app).get('/api/public/interests?name=react');
            
            expect(res.statusCode).toBe(200);
            expect(res.body).toHaveLength(1);
            expect(res.body[0].name).toBe('React');
        });

        it('should search by localized name (PL)', async () => {
            const res = await request(app).get('/api/public/interests?lang=pl&name=Zainteresowanie');
            
            expect(res.statusCode).toBe(200);
            expect(res.body[0].name).toBe('Zainteresowanie PL');
        });

        it('should respect Accept-Language header', async () => {
            const res = await request(app)
                .get(`/api/public/interests?categoryId=${catI18n._id}`)
                .set('Accept-Language', 'pl-PL');

            expect(res.statusCode).toBe(200);
            expect(res.body[0].name).toBe('Zainteresowanie PL');
        });
    });
});