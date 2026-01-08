const request = require('supertest');
const app = require('../server');
const mongoose = require('mongoose');
const Report = require('../models/Report');
const { createSuperAdmin, createVerifiedUser, createReport } = require('./helpers/factories');

describe('Admin Reports API', () => {
    let superadmin, superadminToken;
    let reporter, reported;
    let testReport;

    beforeAll(async () => {
        await mongoose.connection.collection('adminusers').deleteMany({});
        await mongoose.connection.collection('users').deleteMany({});
        
        superadmin = await createSuperAdmin({ username: 'superadmin' });
        const res = await request(app).post('/api/admin/auth/login').send({ username: 'superadmin', password: 'superStrongPassword123!' });
        superadminToken = res.body.token;

        reporter = await createVerifiedUser({ username: 'reporter' });
        reported = await createVerifiedUser({ username: 'reported' });
    });

    beforeEach(async () => {
        await mongoose.connection.collection('reports').deleteMany({});
        testReport = await createReport({ 
            reportedBy: reporter,
            reportedUser: reported,
            overrides: { reportType: 'spam', reason: 'Test Reason', status: 'pending' }
        });
    });

    describe('GET /api/admin/reports', () => {
        it('should list all reports', async () => {
            const res = await request(app)
                .get('/api/admin/reports')
                .set('Authorization', `Bearer ${superadminToken}`);

            expect(res.statusCode).toBe(200);
            expect(res.body.reports).toHaveLength(1);
            expect(res.body.reports[0]._id).toBe(testReport._id.toString());
        });

        it('should filter by status', async () => {
            await createReport({ reportedBy: reporter, reportedUser: reported, overrides: { status: 'action_taken' } });

            const res = await request(app)
                .get('/api/admin/reports?status=pending')
                .set('Authorization', `Bearer ${superadminToken}`);

            expect(res.statusCode).toBe(200);
            expect(res.body.reports).toHaveLength(1);
            expect(res.body.reports[0].status).toBe('pending');
        });

        it('should filter by report type', async () => {
            await createReport({ reportedBy: reporter, reportedUser: reported, overrides: { reportType: 'harassment' } });

            const res = await request(app)
                .get('/api/admin/reports?reportType=spam')
                .set('Authorization', `Bearer ${superadminToken}`);

            expect(res.statusCode).toBe(200);
            expect(res.body.reports).toHaveLength(1);
            expect(res.body.reports[0].reportType).toBe('spam');
        });

        it('should paginate results', async () => {
            await Promise.all(Array.from({ length: 15 }).map(() => createReport({ reportedBy: reporter, reportedUser: reported })));

            const res = await request(app)
                .get('/api/admin/reports?page=1&limit=5')
                .set('Authorization', `Bearer ${superadminToken}`);

            expect(res.statusCode).toBe(200);
            expect(res.body.reports).toHaveLength(5);
            expect(res.body.totalReports).toBe(16); // 1 initial + 15 new
        });

        it('should validate status filter', async () => {
            const res = await request(app)
                .get('/api/admin/reports?status=invalid')
                .set('Authorization', `Bearer ${superadminToken}`);
            
            expect(res.statusCode).toBe(400);
        });
    });

    describe('GET /api/admin/reports/:reportId', () => {
        it('should return report details', async () => {
            const res = await request(app)
                .get(`/api/admin/reports/${testReport._id}`)
                .set('Authorization', `Bearer ${superadminToken}`);

            expect(res.statusCode).toBe(200);
            expect(res.body._id).toBe(testReport._id.toString());
            expect(res.body.reportedUser.username).toBe(reported.username);
        });

        it('should return 404 for non-existent ID', async () => {
            const fakeId = new mongoose.Types.ObjectId();
            const res = await request(app)
                .get(`/api/admin/reports/${fakeId}`)
                .set('Authorization', `Bearer ${superadminToken}`);
            
            expect(res.statusCode).toBe(404);
        });
    });

    describe('PUT /api/admin/reports/:reportId', () => {
        it('should update status and notes', async () => {
            const updateData = { status: 'under_review', adminNotes: 'Investigating' };
            
            const res = await request(app)
                .put(`/api/admin/reports/${testReport._id}`)
                .set('Authorization', `Bearer ${superadminToken}`)
                .send(updateData);

            expect(res.statusCode).toBe(200);
            expect(res.body.report.status).toBe('under_review');
            expect(res.body.report.reviewedBy).toBe(superadmin._id.toString());
        });

        it('should validate status update', async () => {
            const res = await request(app)
                .put(`/api/admin/reports/${testReport._id}`)
                .set('Authorization', `Bearer ${superadminToken}`)
                .send({ status: 'invalid_status' });
            
            expect(res.statusCode).toBe(400);
        });

        it('should require update data', async () => {
            const res = await request(app)
                .put(`/api/admin/reports/${testReport._id}`)
                .set('Authorization', `Bearer ${superadminToken}`)
                .send({});
            
            expect(res.statusCode).toBe(400);
        });
    });
});