// tests/publicInterest.test.js
const request = require('supertest');
const app = require('../server');
const Interest = require('../models/Interest');
const InterestCategory = require('../models/InterestCategory');
const { createInterestCategory, createInterest } = require('./helpers/factories');
const mongoose = require('mongoose');

// Globalne beforeEach z jest.setup.js czyści mocki.

describe('Public Interest API', () => {
    let categoryTech, categoryBooks, categorySports;
    let interestNode, interestReact, interestSciFi, interestFantasy, interestFootball;

    beforeAll(async () => {
        // Wyczyść kolekcje na początku tego suite'u
        await mongoose.connection.collection('interestcategories').deleteMany({});
        await mongoose.connection.collection('interests').deleteMany({});

        // Stwórz kategorie
        categoryTech = await createInterestCategory({ name: 'Technology' });
        categoryBooks = await createInterestCategory({ name: 'Books' });
        categorySports = await createInterestCategory({ name: 'Sports' });

        // Stwórz zainteresowania
        interestNode = await createInterest({ name: 'Node.js Development', category: categoryTech });
        interestReact = await createInterest({ name: 'React Framework', category: categoryTech });
        interestSciFi = await createInterest({ name: 'Science Fiction Novels', category: categoryBooks });
        interestFantasy = await createInterest({ name: 'Fantasy Worlds', category: categoryBooks, overrides: { isArchived: true } }); // Zarchiwizowane
        interestFootball = await createInterest({ name: 'Football (Soccer)', category: categorySports });
        await createInterest({ name: 'Basketball', category: categorySports }); // Dodatkowe dla liczby
    });

    describe('GET /api/public/interests/categories', () => {
        it('should get a list of all public interest categories sorted by name', async () => {
            const res = await request(app).get('/api/public/interests/categories');
            expect(res.statusCode).toEqual(200);
            expect(res.body).toBeInstanceOf(Array);
            expect(res.body.length).toBe(3); // Books, Sports, Technology
            expect(res.body[0].name).toBe('Books'); // Sprawdź sortowanie
            expect(res.body.map(c => c.name)).toEqual(expect.arrayContaining(['Technology', 'Books', 'Sports']));
        });
    });

    describe('GET /api/public/interests', () => {
        it('should get a list of all active (non-archived) public interests', async () => {
            const res = await request(app).get('/api/public/interests');
            expect(res.statusCode).toEqual(200);
            expect(res.body).toBeInstanceOf(Array);
            // Oczekujemy 5 aktywnych: Node, React, SciFi, Football, Basketball (Fantasy jest zarchiwizowane)
            expect(res.body.length).toBe(5);
            expect(res.body.every(interest => interest.isArchived === false || interest.isArchived === undefined)).toBe(true);
            expect(res.body.some(i => i.name === 'Fantasy Worlds')).toBe(false); // Nie powinno być zarchiwizowanego
        });

        it('should filter public interests by categoryId', async () => {
            const res = await request(app).get(`/api/public/interests?categoryId=${categoryTech._id}`);
            expect(res.statusCode).toEqual(200);
            expect(res.body).toBeInstanceOf(Array);
            expect(res.body.length).toBe(2); // Node.js, React
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
            const res = await request(app).get('/api/public/interests?name=node'); // Częściowe zapytanie
            expect(res.statusCode).toEqual(200);
            expect(res.body.length).toBe(1);
            expect(res.body[0].name).toBe('Node.js Development');
        });


        it('should not return archived interests by default when filtering by category', async () => {
            // Fantasy Worlds jest w categoryBooks i jest zarchiwizowane
            const res = await request(app).get(`/api/public/interests?categoryId=${categoryBooks._id}`);
            expect(res.statusCode).toEqual(200);
            expect(res.body.length).toBe(1); // Tylko Science Fiction Novels
            expect(res.body[0].name).toBe('Science Fiction Novels');
        });

        it('should return validation error for invalid categoryId format', async () => {
            const res = await request(app).get('/api/public/interests?categoryId=invalidId');
            expect(res.statusCode).toEqual(400);
            expect(res.body).toHaveProperty('errors');
            expect(res.body.errors[0].msg).toBe('Invalid Category ID format');
        });
    });
});