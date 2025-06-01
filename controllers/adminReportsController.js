// controllers/adminReportsController.js
const Report = require('../models/Report');
const logAuditEvent = require('../utils/auditLogger');
const { validationResult } = require('express-validator');

// @desc    Get all reports (paginated, filterable)
// @route   GET /api/admin/reports
// @access  Private (Admin/Moderator)
const getAllReports = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const query = {};
    if (req.query.status) {
        query.status = req.query.status;
    }
    if (req.query.reportType) {
        query.reportType = req.query.reportType;
    }
    // Można dodać filtrowanie po reportedBy, reportedUser itp.

    try {
        const reports = await Report.find(query)
            .populate('reportedBy', 'username email')
            .populate('reportedUser', 'username email profile.displayName')
            .populate('reportedMessage', 'content senderId') // Można dalej populować senderId
            .populate('reviewedBy', 'username')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const totalReports = await Report.countDocuments(query);

        res.json({
            reports,
            currentPage: page,
            totalPages: Math.ceil(totalReports / limit),
            totalReports
        });
    } catch (error) {
        console.error('Admin Get All Reports Error:', error);
        res.status(500).json({ message: 'Server Error fetching reports.' });
        next(error);
    }
};

// @desc    Get a single report by ID
// @route   GET /api/admin/reports/:reportId
// @access  Private (Admin/Moderator)
const getReportById = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    try {
        const report = await Report.findById(req.params.reportId)
            .populate('reportedBy', 'username email profile')
            .populate('reportedUser', 'username email profile')
            .populate({
                path: 'reportedMessage',
                populate: { path: 'senderId', select: 'username profile' } // Zagnieżdżona populacja
            })
            .populate('reviewedBy', 'username');

        if (!report) {
            return res.status(404).json({ message: 'Report not found.' });
        }
        res.json(report);
    } catch (error) {
        console.error('Admin Get Report By ID Error:', error);
         if (error.kind === 'ObjectId') {
            return res.status(404).json({ message: 'Report not found (invalid ID format)' });
        }
        res.status(500).json({ message: 'Server Error fetching report details.' });
        next(error);
    }
};

// @desc    Update a report (change status, add notes)
// @route   PUT /api/admin/reports/:reportId
// @access  Private (Admin/Moderator)
const updateReport = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    const { status, adminNotes } = req.body;
    // req.adminUser jest dostępne z protectAdmin middleware

    if (!status && adminNotes === undefined) { // Pozwól na aktualizację tylko notatek lub tylko statusu
        return res.status(400).json({ message: 'Either status or adminNotes must be provided for update.' });
    }

    try {
        const report = await Report.findById(req.params.reportId);
        if (!report) {
            return res.status(404).json({ message: 'Report not found.' });
        }

        const oldStatus = report.status;

        if (status) {
            // Walidacja czy status jest dozwolony
            const allowedStatuses = Report.schema.path('status').enumValues;
            if (!allowedStatuses.includes(status)) {
                return res.status(400).json({ message: `Invalid status value. Allowed: ${allowedStatuses.join(', ')}` });
            }
            report.status = status;
        }
        if (adminNotes !== undefined) {
            report.adminNotes = adminNotes;
        }
        report.reviewedBy = req.adminUser._id; // Zapisz ID admina, który zaktualizował

        const updatedReport = await report.save();

        await logAuditEvent(
            'admin_updated_report',
            { type: 'admin', id: req.adminUser._id },
            'admin_action',
            { type: 'report', id: updatedReport._id },
            { previousStatus: oldStatus, newStatus: updatedReport.status, adminNotesAdded: !!adminNotes }, req
        );

        res.json({ message: 'Report updated successfully.', report: updatedReport });

    } catch (error) {
        console.error('Admin Update Report Error:', error);
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(val => val.message);
            return res.status(400).json({ message: messages.join(', ') });
        }
        res.status(500).json({ message: 'Server Error updating report.' });
        next(error);
    }
};

module.exports = { getAllReports, getReportById, updateReport };