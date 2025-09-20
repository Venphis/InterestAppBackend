const request = require('supertest');
const app = require('../server');
const User = require('../models/User');
const Message = require('../models/Message');
const Report = require('../models/Report');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { createVerifiedUser, createMessage, generateUserToken } = require('./helpers/factories');

describe('Report API (User Perspective)', () => {
    let reporterUser;
    let reporterToken;
    let userToReport;
    let messageToReport;

    beforeAll(async () => {
        await mongoose.connection.collection('users').deleteMany({});
        await mongoose.connection.collection('messages').deleteMany({});

        reporterUser = await createVerifiedUser({ username: 'reporterMain_reports', email: 'reporterMain_reports@example.com' });
        reporterToken = generateUserToken(reporterUser);

        userToReport = await createVerifiedUser({ username: 'reportedMain_reports', email: 'reportedMain_reports@example.com' });

        messageToReport = await createMessage({
            chatId: new mongoose.Types.ObjectId(),
            senderId: userToReport,
            content: 'Main reportable message for report tests.'
        });
    });

    describe('POST /api/reports', () => {
        beforeEach(async () => {
            await mongoose.connection.collection('reports').deleteMany({});
        });

        it('should allow a logged-in user to report another user', async () => {
            const reportData = {
                reportedUserId: userToReport._id.toString(),
                reportType: 'harassment',
                reason: 'This user is sending harassing messages.'
            };
            const res = await request(app)
                .post('/api/reports')
                .set('Authorization', `Bearer ${reporterToken}`)
                .send(reportData);

            expect(res.statusCode).toEqual(201);
            expect(res.body).toHaveProperty('report');
            expect(res.body.report.reportedBy).toBe(reporterUser._id.toString());
            expect(res.body.report.reportedUser).toBe(userToReport._id.toString());
        });

        it('should allow a logged-in user to report a message', async () => {
            const reportData = {
                reportedMessageId: messageToReport._id.toString(),
                reportType: 'spam',
                reason: 'This message is spam.'
            };
            const res = await request(app)
                .post('/api/reports')
                .set('Authorization', `Bearer ${reporterToken}`)
                .send(reportData);

            expect(res.statusCode).toEqual(201);
            expect(res.body.report.reportedMessage).toBe(messageToReport._id.toString());
        });

        it('should not allow reporting oneself', async () => {
            const reportData = { reportedUserId: reporterUser._id.toString(), reportType: 'other', reason: 'test self report' };
            const res = await request(app)
                .post('/api/reports')
                .set('Authorization', `Bearer ${reporterToken}`)
                .send(reportData);
            expect(res.statusCode).toEqual(400);
            expect(res.body.message).toBe('You cannot report yourself.');
        });

        it('should return validation errors for missing reason or reportType', async () => {
            const resMissingReason = await request(app)
                .post('/api/reports')
                .set('Authorization', `Bearer ${reporterToken}`)
                .send({ reportedUserId: userToReport._id.toString(), reportType: 'spam' });
            expect(resMissingReason.statusCode).toEqual(400);
            expect(resMissingReason.body.errors.some(e => e.path === 'reason')).toBe(true);

            const resMissingType = await request(app)
                .post('/api/reports')
                .set('Authorization', `Bearer ${reporterToken}`)
                .send({ reportedUserId: userToReport._id.toString(), reason: 'Valid reason here' });
            expect(resMissingType.statusCode).toEqual(400);
            expect(resMissingType.body.errors.some(e => e.path === 'reportType')).toBe(true);
        });

        it('should return validation error for invalid reportType', async () => {
            const reportData = {
                reportedUserId: userToReport._id.toString(),
                reportType: 'invalid_report_type_value',
                reason: 'Some reason with invalid type'
            };
            const res = await request(app)
                .post('/api/reports')
                .set('Authorization', `Bearer ${reporterToken}`)
                .send(reportData);
            expect(res.statusCode).toEqual(400);
            expect(res.body.errors[0].msg).toBe('Invalid report type');
        });

        it('should require either reportedUserId or reportedMessageId (validation)', async () => {
            const res = await request(app)
                .post('/api/reports')
                .set('Authorization', `Bearer ${reporterToken}`)
                .send({ reportType: 'spam', reason: 'No target specified for this report.' });
            expect(res.statusCode).toEqual(400);
            expect(res.body.errors[0].msg).toBe('Either reportedUserId or reportedMessageId must be provided.');
        });

        it('should not allow reporting a non-existent user', async () => {
            const nonExistentUserId = new mongoose.Types.ObjectId().toString();
            const reportData = { reportedUserId: nonExistentUserId, reportType: 'impersonation', reason: 'Impersonating.' };
            const res = await request(app)
                .post('/api/reports')
                .set('Authorization', `Bearer ${reporterToken}`)
                .send(reportData);
            expect(res.statusCode).toEqual(404);
            expect(res.body.message).toBe('User to report not found.');
        });

        it('should not allow reporting a non-existent message', async () => {
            const nonExistentMessageId = new mongoose.Types.ObjectId().toString();
            const reportData = { reportedMessageId: nonExistentMessageId, reportType: 'inappropriate_content', reason: 'Message gone.' };
            const res = await request(app)
                .post('/api/reports')
                .set('Authorization', `Bearer ${reporterToken}`)
                .send(reportData);
            expect(res.statusCode).toEqual(404);
            expect(res.body.message).toBe('Message to report not found.');
        });

        it('should not allow creating a report if not logged in (no token)', async () => {
        const reportData = {
            reportedUserId: userToReport._id.toString(),
            reportType: 'harassment',
            reason: 'This should fail without a token.'
        };
        const res = await request(app)
            .post('/api/reports')
            .send(reportData);

        expect(res.statusCode).toEqual(401);
        expect(res.body.message).toContain('Not authorized, no token or malformed header');
        });

    });
});