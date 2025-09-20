const request = require('supertest');
const app = require('../server');
const Report = require('../models/Report');
const { createSuperAdmin, createVerifiedUser, createReport } = require('./helpers/factories');
const mongoose = require('mongoose');

describe('Admin Reports API', () => {
    let superadmin;
    let superadminToken;
    let reporterUser;
    let reportedUser;
    let testReport; 

    beforeAll(async () => {
        await mongoose.connection.collection('adminusers').deleteMany({});
        await mongoose.connection.collection('users').deleteMany({});
        await mongoose.connection.collection('reports').deleteMany({});


        superadmin = await createSuperAdmin({ username: 'reportReviewAdmin' });
        const loginRes = await request(app)
            .post('/api/admin/auth/login')
            .send({ username: 'reportReviewAdmin', password: 'superStrongPassword123!' }); 
        expect(loginRes.statusCode).toBe(200); 
        superadminToken = loginRes.body.token;
        if (!superadminToken) throw new Error("Failed to get superadmin token in beforeAll");

        reporterUser = await createVerifiedUser({ username: 'reporterForAdminReports', email: 'reporterAR@example.com' });
        reportedUser = await createVerifiedUser({ username: 'reportedForAdminReports', email: 'reportedAR@example.com' });
    });

    beforeEach(async () => {
        await mongoose.connection.collection('reports').deleteMany({});
        testReport = await createReport({ 
            reportedBy: reporterUser,
            reportedUser: reportedUser, 
            overrides: { 
                reportType: 'harassment',
                reason: 'Initial test report reason for admin tests.',
                status: 'pending'
            }
        });
    });


    describe('GET /api/admin/reports', () => {
        it('should get a list of reports', async () => {
            const res = await request(app)
                .get('/api/admin/reports')
                .set('Authorization', `Bearer ${superadminToken}`);

            expect(res.statusCode).toEqual(200);
            expect(res.body).toHaveProperty('reports');
            expect(res.body.reports.length).toBe(1);
            expect(res.body.reports[0]._id).toBe(testReport._id.toString());
        });

        it('should filter reports by status', async () => {
            await createReport({
                reportedBy: reporterUser, reportedUser: reportedUser,
                overrides: { reportType: 'spam', reason: 'Spam report', status: 'action_taken' }
            });

            const res = await request(app)
                .get('/api/admin/reports?status=pending')
                .set('Authorization', `Bearer ${superadminToken}`);

            expect(res.statusCode).toEqual(200);
            expect(res.body.reports.length).toBe(1); 
            expect(res.body.reports[0].status).toBe('pending');
        });

        it('should return empty array if no reports match filter', async () => {
            const res = await request(app)
                .get('/api/admin/reports?status=resolved_with_reporter')
                .set('Authorization', `Bearer ${superadminToken}`);
            expect(res.statusCode).toEqual(200);
            expect(res.body.reports).toEqual([]);
        });

        it('should filter reports by reportType', async () => {
            await createReport({ reportedBy: reporterUser, reportedUser: reportedUser, overrides: { reportType: 'spam', reason: 'Another spam report' } });
            const res = await request(app)
                .get('/api/admin/reports?reportType=spam')
                .set('Authorization', `Bearer ${superadminToken}`);
            expect(res.statusCode).toEqual(200);
            expect(res.body.reports.length).toBe(1);
            expect(res.body.reports[0].reportType).toBe('spam');
        });

        it('should handle pagination for getting reports', async () => {
            for (let i = 0; i < 15; i++) {
                await createReport({
                    reportedBy: reporterUser,
                    reportedUser: reportedUser,
                    overrides: { reason: `Paginated report ${i}`, reportType: i % 2 === 0 ? 'spam' : 'other' }
                });
            }

            const resPage1 = await request(app)
                .get('/api/admin/reports?page=1&limit=5')
                .set('Authorization', `Bearer ${superadminToken}`);
            expect(resPage1.statusCode).toEqual(200);
            expect(resPage1.body.reports.length).toBe(5);
            expect(resPage1.body.currentPage).toBe(1);
            expect(resPage1.body.totalPages).toBe(Math.ceil(16 / 5)); 
            expect(resPage1.body.totalReports).toBe(16);

            const resPage2 = await request(app)
                .get('/api/admin/reports?page=2&limit=5')
                .set('Authorization', `Bearer ${superadminToken}`);
            expect(resPage2.statusCode).toEqual(200);
            expect(resPage2.body.reports.length).toBe(5);
            expect(resPage2.body.currentPage).toBe(2);
        });


        it('should return validation error for invalid status query', async () => {
            const res = await request(app)
                .get('/api/admin/reports?status=invalidStatusValue')
                .set('Authorization', `Bearer ${superadminToken}`);
            expect(res.statusCode).toEqual(400);
            expect(res.body).toHaveProperty('errors');
            expect(res.body.errors[0].msg).toContain('Invalid status value');
        });


    });


    describe('GET /api/admin/reports/:reportId', () => {
        it('should get a single report by ID', async () => {
            const res = await request(app)
                .get(`/api/admin/reports/${testReport._id}`)
                .set('Authorization', `Bearer ${superadminToken}`);

            expect(res.statusCode).toEqual(200);
            expect(res.body._id).toBe(testReport._id.toString());
            expect(res.body.reportedUser).toBeDefined();
            expect(res.body.reportedUser.username).toBe(reportedUser.username);
        });

        it('should return 404 for a non-existent report ID', async () => {
            const fakeId = new mongoose.Types.ObjectId().toString();
            const res = await request(app)
                .get(`/api/admin/reports/${fakeId}`)
                .set('Authorization', `Bearer ${superadminToken}`);
            expect(res.statusCode).toEqual(404);
        });

        it('should return validation error for invalid report ID format', async () => {
            const res = await request(app)
                .get(`/api/admin/reports/invalidIdFormat123`)
                .set('Authorization', `Bearer ${superadminToken}`);
            expect(res.statusCode).toEqual(400);
            expect(res.body).toHaveProperty('errors');
            expect(res.body.errors[0].msg).toBe('Invalid Report ID');
        });
    });

    describe('PUT /api/admin/reports/:reportId', () => {
        it('should update a report status and adminNotes', async () => {
            const updateData = {
                status: 'under_review',
                adminNotes: 'Investigating this report further.'
            };
            const res = await request(app)
                .put(`/api/admin/reports/${testReport._id}`)
                .set('Authorization', `Bearer ${superadminToken}`)
                .send(updateData);

            expect(res.statusCode).toEqual(200);
            expect(res.body.report.status).toBe('under_review');
            expect(res.body.report.adminNotes).toBe('Investigating this report further.');
            expect(res.body.report.reviewedBy).toBe(superadmin._id.toString()); 

            const reportInDb = await Report.findById(testReport._id);
            expect(reportInDb.status).toBe('under_review');
        });

        it('should return validation error for invalid status value in body', async () => {
            const res = await request(app)
                .put(`/api/admin/reports/${testReport._id}`)
                .set('Authorization', `Bearer ${superadminToken}`)
                .send({ status: 'invalid_status_value' });
            expect(res.statusCode).toEqual(400);
            expect(res.body).toHaveProperty('errors');
            expect(res.body.errors[0].msg).toContain('Invalid status value');
        });

        it('should require either status or adminNotes for update (validation)', async () => {
            const res = await request(app)
                .put(`/api/admin/reports/${testReport._id}`)
                .set('Authorization', `Bearer ${superadminToken}`)
                .send({}); 
            expect(res.statusCode).toEqual(400);
            expect(res.body.errors[0].msg).toBe('Either status or adminNotes must be provided for update.');
        });

        it('should return 404 when trying to update a non-existent report', async () => {
            const fakeId = new mongoose.Types.ObjectId().toString();
            const res = await request(app)
                .put(`/api/admin/reports/${fakeId}`)
                .set('Authorization', `Bearer ${superadminToken}`)
                .send({ status: 'resolved_with_reporter' });
            expect(res.statusCode).toEqual(404);
        });
    });
});