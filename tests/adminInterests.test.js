// tests/adminInterests.test.js
const request = require('supertest');
const app = require('../server');
const Interest = require('../models/Interest');
const InterestCategory = require('../models/InterestCategory');
const AdminUser = require('../models/AdminUser'); // Potrzebny do stworzenia admina
const { createSuperAdmin, createAdmin, createInterestCategory, createInterest } = require('./helpers/factories');
const mongoose = require('mongoose');

describe('Admin Interests API', () => {
    let superadminToken;
    let adminToken;
    let testCategory; // Przechowaj stworzoną kategorię do użycia w testach zainteresowań

    beforeAll(async () => {
        await mongoose.connection.collection('adminusers').deleteMany({});
        await mongoose.connection.collection('interestcategories').deleteMany({});
        await mongoose.connection.collection('interests').deleteMany({});

        const superadmin = await createSuperAdmin({ username: 'interestSuperAdmin' });
        let res = await request(app).post('/api/admin/auth/login').send({ username: 'interestSuperAdmin', password: 'superStrongPassword123!' });
        expect(res.statusCode).toBe(200);
        superadminToken = res.body.token;

        const admin = await createAdmin({ username: 'interestAdmin' });
        res = await request(app).post('/api/admin/auth/login').send({ username: 'interestAdmin', password: 'superStrongPassword123!' }); // Zakładając, że fabryka admina używa tego samego hasła
        expect(res.statusCode).toBe(200);
        adminToken = res.body.token;

        // Stwórz jedną kategorię na potrzeby testów
        testCategory = await createInterestCategory({ name: 'General Tech' });
    });

    // --- Interest Category Management ---
    describe('Interest Categories - /api/admin/interests/categories', () => {
        let categoryIdToTest;

        beforeEach(async () => {
            // Czyść kategorie przed każdym testem, oprócz tej stworzonej w beforeAll
            await InterestCategory.deleteMany({ name: { $ne: 'General Tech'} });
            const cat = await createInterestCategory({ name: 'Category To Modify' });
            categoryIdToTest = cat._id.toString();
        });

        it('should allow admin to create a new interest category', async () => {
            const newCategoryData = { name: 'Science Fiction Books', description: 'Books about future and space.' };
            const res = await request(app)
                .post('/api/admin/interests/categories')
                .set('Authorization', `Bearer ${adminToken}`) // Zwykły admin może tworzyć
                .send(newCategoryData);
            expect(res.statusCode).toEqual(201);
            expect(res.body.name).toBe(newCategoryData.name);
        });

        it('should prevent creating a category with a duplicate name', async () => {
            const res = await request(app)
                .post('/api/admin/interests/categories')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ name: 'General Tech' }); // Ta kategoria już istnieje
            expect(res.statusCode).toEqual(400);
            expect(res.body.message).toContain('already exists');
        });

        it('should get a list of all interest categories', async () => {
            const res = await request(app)
                .get('/api/admin/interests/categories')
                .set('Authorization', `Bearer ${adminToken}`);
            expect(res.statusCode).toEqual(200);
            expect(res.body).toBeInstanceOf(Array);
            expect(res.body.length).toBeGreaterThanOrEqual(2); // General Tech + Category To Modify
            expect(res.body.some(cat => cat.name === 'General Tech')).toBe(true);
        });

        it('should allow admin to update an interest category', async () => {
            const updateData = { name: 'Updated Category Name', description: 'New desc' };
            const res = await request(app)
                .put(`/api/admin/interests/categories/${categoryIdToTest}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send(updateData);
            expect(res.statusCode).toEqual(200);
            expect(res.body.name).toBe(updateData.name);
            expect(res.body.description).toBe(updateData.description);
        });

        it('should allow superadmin to delete an interest category (if no interests linked)', async () => {
            // Upewnij się, że kategoria nie ma powiązanych zainteresowań
            await Interest.deleteMany({ category: categoryIdToTest });
            const res = await request(app)
                .delete(`/api/admin/interests/categories/${categoryIdToTest}`)
                .set('Authorization', `Bearer ${superadminToken}`);
            expect(res.statusCode).toEqual(200);
            expect(res.body.message).toContain('deleted successfully');
            const deletedCat = await InterestCategory.findById(categoryIdToTest);
            expect(deletedCat).toBeNull();
        });

        it('should prevent deleting a category if it has active interests (implement this logic in controller)', async () => {
            await createInterest({ name: 'Test Interest In Category', category: testCategory }); // Użyj testCategory z beforeAll
            const res = await request(app)
                .delete(`/api/admin/interests/categories/${testCategory._id}`)
                .set('Authorization', `Bearer ${superadminToken}`);
            // Oczekiwany status zależy od logiki kontrolera (np. 400 jeśli zabrania)
            // Załóżmy, że kontroler deleteInterestCategory ma logikę sprawdzania
            expect(res.statusCode).toEqual(400);
            expect(res.body.message).toContain('Cannot delete category. It still contains');
        });

    });

    // --- Interest Management ---
    describe('Interests - /api/admin/interests', () => {
        let interestToModify;

        beforeEach(async () => {
            await Interest.deleteMany({ name: { $ne: 'SomePersistentInterest' }}); // Czyść selektywnie
            interestToModify = await createInterest({ name: 'Interest To Modify', category: testCategory });
        });

        it('should allow admin to create a new interest with a category', async () => {
            const newInterestData = { name: 'New Tech Interest', description: 'About new tech', categoryId: testCategory._id.toString() };
            const res = await request(app)
                .post('/api/admin/interests')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(newInterestData);
            expect(res.statusCode).toEqual(201);
            expect(res.body.name).toBe(newInterestData.name);
            expect(res.body.category).toBeDefined();
            expect(res.body.category._id.toString()).toBe(testCategory._id.toString());
        });

        it('should allow admin to create a new interest without a category', async () => {
            const newInterestData = { name: 'Categoryless Interest', description: 'No category here' };
            const res = await request(app)
                .post('/api/admin/interests')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(newInterestData);
            expect(res.statusCode).toEqual(201);
            expect(res.body.name).toBe(newInterestData.name);
            expect(res.body.category).toBeNull();
        });

        it('should get a list of interests (default: active only)', async () => {
            await createInterest({ name: 'Archived Interest Test', category: testCategory, overrides: { isArchived: true } });
            const res = await request(app)
                .get('/api/admin/interests')
                .set('Authorization', `Bearer ${adminToken}`);
            expect(res.statusCode).toEqual(200);
            expect(res.body.interests.length).toBe(1); // Tylko "Interest To Modify"
            expect(res.body.interests[0].isArchived).toBe(false);
        });

        it('should get a list of interests including archived when requested', async () => {
            await createInterest({ name: 'Archived Interest Test 2', category: testCategory, overrides: { isArchived: true } });
            const res = await request(app)
                .get('/api/admin/interests?showArchived=true')
                .set('Authorization', `Bearer ${adminToken}`);
            expect(res.statusCode).toEqual(200);
            expect(res.body.interests.length).toBe(2); // "Interest To Modify" + "Archived Interest Test 2"
            expect(res.body.interests.some(i => i.isArchived === true)).toBe(true);
        });


        it('should allow admin to update an interest (name, category, description, isArchived)', async () => {
            const anotherCategory = await createInterestCategory({ name: uniqueCategoryName() });
            const updateData = {
                name: 'Super Updated Interest Name',
                categoryId: anotherCategory._id.toString(),
                description: 'This is a super updated description.',
                isArchived: true
            };
            const res = await request(app)
                .put(`/api/admin/interests/${interestToModify._id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send(updateData);
            expect(res.statusCode).toEqual(200);
            expect(res.body.name).toBe(updateData.name);
            expect(res.body.category._id.toString()).toBe(anotherCategory._id.toString());
            expect(res.body.description).toBe(updateData.description);
            expect(res.body.isArchived).toBe(true);
        });

        it('should allow admin to archive an interest', async () => {
            const res = await request(app)
                .delete(`/api/admin/interests/${interestToModify._id}`) // Zakładając, że DELETE archiwizuje
                .set('Authorization', `Bearer ${adminToken}`);
            expect(res.statusCode).toEqual(200);
            expect(res.body.message).toContain('archived successfully');
            const interestInDb = await Interest.findById(interestToModify._id);
            expect(interestInDb.isArchived).toBe(true);
        });

        it('should allow admin to restore an archived interest', async () => {
            await Interest.findByIdAndUpdate(interestToModify._id, { isArchived: true });
            const res = await request(app)
                .put(`/api/admin/interests/${interestToModify._id}/restore`)
                .set('Authorization', `Bearer ${adminToken}`);
            expect(res.statusCode).toEqual(200);
            expect(res.body.interest.isArchived).toBe(false);
            const interestInDb = await Interest.findById(interestToModify._id);
            expect(interestInDb.isArchived).toBe(false);
        });

        it('should prevent creating an interest with a duplicate name and category (if active)', async () => {
            // Stwórz pierwsze zainteresowanie
            const firstInterestName = 'UniqueNameForDupTest';
            await createInterest({ name: firstInterestName, category: testCategory });

            // Spróbuj stworzyć drugie o tej samej nazwie i kategorii
            const res = await request(app)
                .post('/api/admin/interests')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ name: firstInterestName, categoryId: testCategory._id.toString(), description: 'Trying to duplicate' });
            expect(res.statusCode).toEqual(400);
            expect(res.body.message).toContain('already exists');
        });

        it('should allow creating an interest with the same name but different category', async () => {
            const anotherCategory = await createInterestCategory({name: uniqueCategoryName()});
            const interestName = "SameNameDifferentCat";
            await createInterest({ name: interestName, category: testCategory });

            const res = await request(app)
                .post('/api/admin/interests')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ name: interestName, categoryId: anotherCategory._id.toString() });
            expect(res.statusCode).toEqual(201);
            expect(res.body.name).toBe(interestName);
            expect(res.body.category._id.toString()).toBe(anotherCategory._id.toString());
        });

        it('should allow creating an interest with the same name if the existing one is archived', async () => {
            const interestName = "ArchivableName";
            // Stwórz i zarchiwizuj pierwsze
            const firstInterest = await createInterest({ name: interestName, category: testCategory });
            await Interest.findByIdAndUpdate(firstInterest._id, { isArchived: true });

            // Spróbuj stworzyć nowe aktywne o tej samej nazwie
            const res = await request(app)
                .post('/api/admin/interests')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ name: interestName, categoryId: testCategory._id.toString() });
            expect(res.statusCode).toEqual(201); // Powinno się udać, bo stary jest zarchiwizowany
            expect(res.body.name).toBe(interestName);
            expect(res.body.isArchived).toBe(false);
        });
    });



});