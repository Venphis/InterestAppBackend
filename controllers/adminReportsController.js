const Report = require('../models/Report');
const logAuditEvent = require('../utils/auditLogger');
const { validationResult } = require('express-validator');

// Get filtered reports with pagination
const getAllReports = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const query = {};
    if (req.query.status) query.status = req.query.status;
    if (req.query.reportType) query.reportType = req.query.reportType;

    try {
        const [reports, totalReports] = await Promise.all([
            Report.find(query)
                .populate('reportedBy', 'username email')
                .populate('reportedUser', 'username email profile.displayName')
                .populate('reportedMessage', 'content senderId')
                .populate('reviewedBy', 'username')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            Report.countDocuments(query)
        ]);

        res.json({
            reports,
            currentPage: page,
            totalPages: Math.ceil(totalReports / limit),
            totalReports
        });
    } catch (error) {
        console.error('Get All Reports Error:', error.message);
        next(error);
    }
};

// Get single report details
const getReportById = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
        const report = await Report.findById(req.params.reportId)
            .populate('reportedBy', 'username email profile')
            .populate('reportedUser', 'username email profile')
            .populate({
                path: 'reportedMessage',
                populate: { path: 'senderId', select: 'username profile' }
            })
            .populate('reviewedBy', 'username');

        if (!report) return res.status(404).json({ message: 'Report not found' });

        res.json(report);
    } catch (error) {
        console.error('Get Report Details Error:', error.message);
        next(error);
    }
};

// Update report status or notes
const updateReport = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { status, adminNotes } = req.body;

    if (!status && adminNotes === undefined) {
        return res.status(400).json({ message: 'Provide status or notes to update' });
    }

    try {
        const report = await Report.findById(req.params.reportId);
        if (!report) return res.status(404).json({ message: 'Report not found' });

        const oldStatus = report.status;

        if (status) {
            const allowedStatuses = Report.schema.path('status').enumValues;
            if (!allowedStatuses.includes(status)) {
                return res.status(400).json({ message: `Invalid status. Allowed: ${allowedStatuses.join(', ')}` });
            }
            report.status = status;
        }

        if (adminNotes !== undefined) report.adminNotes = adminNotes;
        
        report.reviewedBy = req.adminUser._id;

        const updatedReport = await report.save();

        await logAuditEvent(
            'admin_updated_report',
            { type: 'admin', id: req.adminUser._id },
            'admin_action',
            { type: 'report', id: updatedReport._id },
            { 
                previousStatus: oldStatus, 
                newStatus: updatedReport.status, 
                notesUpdated: adminNotes !== undefined 
            }, req
        );

        res.json({ message: 'Report updated', report: updatedReport });
    } catch (error) {
        console.error('Update Report Error:', error.message);
        next(error);
    }
};

module.exports = { getAllReports, getReportById, updateReport };