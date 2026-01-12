const request = require('supertest');
const app = require('../server');
const mongoose = require('mongoose');
const Report = require('../models/Report');
const { createVerifiedUser, createMessage, generateUserToken } = require('./helpers/factories');

describe('Report API (User)', () => {
    let reporter, reportedUser;
    let reporterToken;
    let reportedMessage;

    beforeAll(async () => {
        await mongoose.connection.collection('users').deleteMany({});
        await mongoose.connection.collection('messages').deleteMany({});

        reporter = await createVerifiedUser({ username: 'reporter', email: 'reporter@test.com' });
        reporterToken = generateUserToken(reporter);

        reportedUser = await createVerifiedUser({ username: 'reported', email: 'reported@test.com' });

        reportedMessage = await createMessage({
            chatId: new mongoose.Types.ObjectId(),
            senderId: reportedUser,
            content: 'bad message'
        });
    });

    beforeEach(async () => {
        await Report.deleteMany({});
    });

    describe('POST /api/reports', () => {
        it('should report a user', async () => {
            const res = await request(app)
                .post('/api/reports')
                .set('Authorization', `Bearer ${reporterToken}`)
                .send({
                    reportedUserId: reportedUser._id,
                    reportType: 'harassment',
                    reason: 'Harassing me'
                });

            expect(res.statusCode).toBe(201);
            expect(res.body.report.reportedUser).toBe(reportedUser._id.toString());
        });

        it('should report a message', async () => {
            const res = await request(app)
                .post('/api/reports')
                .set('Authorization', `Bearer ${reporterToken}`)
                .send({
                    reportedMessageId: reportedMessage._id,
                    reportType: 'spam',
                    reason: 'This is spam'
                });

            expect(res.statusCode).toBe(201);
            expect(res.body.report.reportedMessage).toBe(reportedMessage._id.toString());
        });

        it('should prevent self-reporting', async () => {
            const res = await request(app)
                .post('/api/reports')
                .set('Authorization', `Bearer ${reporterToken}`)
                .send({
                    reportedUserId: reporter._id,
                    reportType: 'other',
                    reason: 'Self report'
                });

            expect(res.statusCode).toBe(400);
            expect(res.body.message).toMatch(/cannot report self/i);
        });

        it('should validate required fields', async () => {
            const res = await request(app)
                .post('/api/reports')
                .set('Authorization', `Bearer ${reporterToken}`)
                .send({});

            expect(res.statusCode).toBe(400);
            expect(res.body.errors).toBeDefined();
        });

        it('should validate report type', async () => {
            const res = await request(app)
                .post('/api/reports')
                .set('Authorization', `Bearer ${reporterToken}`)
                .send({
                    reportedUserId: reportedUser._id,
                    reportType: 'invalid_type',
                    reason: 'Reason'
                });

            expect(res.statusCode).toBe(400);
            expect(res.body.errors[0].msg).toMatch(/Invalid report type/);
        });

        it('should require a target (user or message)', async () => {
            const res = await request(app)
                .post('/api/reports')
                .set('Authorization', `Bearer ${reporterToken}`)
                .send({
                    reportType: 'spam',
                    reason: 'No target'
                });

            expect(res.statusCode).toBe(400);
        });

        it('should return 404 for non-existent targets', async () => {
            const fakeId = new mongoose.Types.ObjectId();
            
            const res = await request(app)
                .post('/api/reports')
                .set('Authorization', `Bearer ${reporterToken}`)
                .send({
                    reportedUserId: fakeId,
                    reportType: 'spam',
                    reason: 'Ghost user'
                });

            expect(res.statusCode).toBe(404);
        });

        it('should reject unauthenticated request', async () => {
            const res = await request(app)
                .post('/api/reports')
                .send({
                    reportedUserId: reportedUser._id,
                    reportType: 'spam',
                    reason: 'No token'
                });

            expect(res.statusCode).toBe(401);
        });
    });
});