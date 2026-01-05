const request = require('supertest');
const app = require('../server');
const Interest = require('../models/Interest');
const InterestCategory = require('../models/InterestCategory');
const { createInterestCategory, createInterest } = require('./helpers/factories');
const mongoose = require('mongoose');

describe('Public Interest API', () => {
    let categoryTech, categoryBooks, categorySports;
    let interestNode, interestReact, interestSciFi, interestFantasy, interestFootball;

    // i18n fixtures
    let categoryPl;
    let interestPl;

    beforeAll(async () => {
        await mongoose.connection.collection('interestcategories').deleteMany({});
        await mongoose.connection.collection('interests').deleteMany({});

        categoryTech = await createInterestCategory({ name: 'Technology' });
        categoryBooks = await createInterestCategory({ name: 'Books' });
        categorySports = await createInterestCategory({ name: 'Sports' });

        interestNode = await createInterest({ name: 'Node.js Development', category: categoryTech });
        interestReact = await createInterest({ name: 'React Framework', category: categoryTech });
        interestSciFi = await createInterest({ name: 'Science Fiction Novels', category: categoryBooks });
        interestFantasy = await createInterest({ name: 'Fantasy Worlds', category: categoryBooks, overrides: { isArchived: true } });
        interestFootball = await createInterest({ name: 'Football (Soccer)', category: categorySports });
        await createInterest({ name: 'Basketball', category: categorySports });

        // --- i18n test data (PL base + EN translation)
        categoryPl = await createInterestCategory({ name: 'Category EN', description: 'EN category description' });
        interestPl = await createInterest({ name: 'Interest EN', category: categoryPl, description: 'EN interest description' });

        // ustaw PL jako tłumaczenie
        const catDoc = await InterestCategory.findById(categoryPl._id);
        catDoc.i18n = catDoc.i18n || new Map();
        catDoc.i18n.set('pl', { name: 'Kategoria PL', description: 'Opis PL kategorii' });
        await catDoc.save();

        const intDoc = await Interest.findById(interestPl._id);
        intDoc.i18n = intDoc.i18n || new Map();
        intDoc.i18n.set('pl', { name: 'Zainteresowanie PL', description: 'Opis PL zainteresowania' });
        await intDoc.save();
    });

    describe('GET /api/public/interests/categories', () => {
        it('should get a list of all public interest categories sorted by name', async () => {
            const res = await request(app).get('/api/public/interests/categories');
            expect(res.statusCode).toEqual(200);
            expect(res.body).toBeInstanceOf(Array);

            // mamy +1 bo dodaliśmy "Kategoria PL"
            expect(res.body.length).toBe(4);
            expect(res.body[0].name).toBe('Books');
            expect(res.body.map(c => c.name)).toEqual(
                expect.arrayContaining(['Technology', 'Books', 'Sports', 'Category EN'])
                );
        });
    });

    describe('GET /api/public/interests', () => {
        it('should get a list of all active (non-archived) public interests', async () => {
            const res = await request(app).get('/api/public/interests');
            expect(res.statusCode).toEqual(200);
            expect(res.body).toBeInstanceOf(Array);

            // było 5, dodaliśmy "Zainteresowanie PL" => 6
            expect(res.body.length).toBe(6);

            expect(res.body.every(interest => interest.isArchived === false || interest.isArchived === undefined)).toBe(true);
            expect(res.body.some(i => i.name === 'Fantasy Worlds')).toBe(false);
        });

        it('should filter public interests by categoryId', async () => {
            const res = await request(app).get(`/api/public/interests?categoryId=${categoryTech._id}`);
            expect(res.statusCode).toEqual(200);
            expect(res.body).toBeInstanceOf(Array);
            expect(res.body.length).toBe(2);
            expect(res.body.every(interest => interest.category._id.toString() === categoryTech._id.toString())).toBe(true);
        });

        it('should filter public interests by name query (case-insensitive)', async () => {
            const res = await request(app).get('/api/public/interests?name=React');
            expect(res.statusCode).toEqual(200);
            expect(res.body).toBeInstanceOf(Array);
            expect(res.body.length).toBe(1);
            expect(res.body[0].name).toBe('React Framework');
        });

        it('should filter public interests by partial name query', async () => {
            const res = await request(app).get('/api/public/interests?name=node');
            expect(res.statusCode).toEqual(200);
            expect(res.body.length).toBe(1);
            expect(res.body[0].name).toBe('Node.js Development');
        });

        it('should not return archived interests by default when filtering by category', async () => {
            const res = await request(app).get(`/api/public/interests?categoryId=${categoryBooks._id}`);
            expect(res.statusCode).toEqual(200);
            expect(res.body.length).toBe(1);
            expect(res.body[0].name).toBe('Science Fiction Novels');
        });

        it('should return validation error for invalid categoryId format', async () => {
            const res = await request(app).get('/api/public/interests?categoryId=invalidId');
            expect(res.statusCode).toEqual(400);
            expect(res.body).toHaveProperty('errors');
            expect(res.body.errors[0].msg).toBe('Invalid Category ID format');
        });
    });

    describe('i18n (lang + Accept-Language) - Public API', () => {
        it('should return translated category and interest names when ?lang=en', async () => {
            const catRes = await request(app).get(`/api/public/interests/categories?lang=en`);
            expect(catRes.statusCode).toBe(200);

            const translatedCat = catRes.body.find(c => c._id.toString() === categoryPl._id.toString());
            expect(translatedCat).toBeTruthy();
            expect(translatedCat.name).toBe('Category EN');

            const intRes = await request(app).get(`/api/public/interests?categoryId=${categoryPl._id}&lang=en`);
            expect(intRes.statusCode).toBe(200);
            expect(intRes.body.length).toBe(1);
            expect(intRes.body[0].name).toBe('Interest EN');
            expect(intRes.body[0].category.name).toBe('Category EN');
        });

        it('should fall back when translation does not exist (e.g. lang=de)', async () => {
            const res = await request(app).get(`/api/public/interests?categoryId=${categoryPl._id}&lang=de`);
            expect(res.statusCode).toBe(200);
            expect(res.body.length).toBe(1);

            // fallback => bazowa nazwa
            expect(res.body[0].name).toBe('Interest EN');
            expect(res.body[0].category.name).toBe('Category EN');
        });

        it('should use Accept-Language header (en-US -> fallback to en)', async () => {
            const res = await request(app)
                .get(`/api/public/interests?categoryId=${categoryPl._id}`)
                .set('Accept-Language', 'en-US,en;q=0.9,pl;q=0.8');

            expect(res.statusCode).toBe(200);
            expect(res.body.length).toBe(1);
            expect(res.body[0].name).toBe('Interest EN');
        });

        it('should allow searching by translated name when lang=en', async () => {
            const res = await request(app).get(`/api/public/interests?lang=en&name=Interest%20EN`);
            expect(res.statusCode).toBe(200);

            const hit = res.body.find(i => i._id.toString() === interestPl._id.toString());
            expect(hit).toBeTruthy();
            expect(hit.name).toBe('Interest EN');
        });
    });
});
