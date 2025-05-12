// controllers/reportController.js
const Report = require('../models/Report');
const User = require('../models/User');
const Message = require('../models/Message');
const { validationResult } = require('express-validator');

// @desc    Create a new report
// @route   POST /api/reports
// @access  Private (User)
const createReport = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    const { reportedUserId, reportedMessageId, reportType, reason } = req.body;

    if (!reportType || !reason) {
        return res.status(400).json({ message: 'Report type and reason are required.' });
    }
    if (!reportedUserId && !reportedMessageId) {
        return res.status(400).json({ message: 'Either reportedUserId or reportedMessageId must be provided.' });
    }

    try {
        // Walidacja czy zgłaszane encje istnieją
        if (reportedUserId) {
            const userExists = await User.findById(reportedUserId);
            if (!userExists) return res.status(404).json({ message: 'User to report not found.' });
            if (reportedUserId === req.user._id.toString()) { // req.user z 'protect' middleware
                 return res.status(400).json({ message: 'You cannot report yourself.' });
            }
        }
        if (reportedMessageId) {
            const messageExists = await Message.findById(reportedMessageId);
            if (!messageExists) return res.status(404).json({ message: 'Message to report not found.' });
             // Można dodać sprawdzenie, czy zgłaszana wiadomość nie należy do zgłaszającego,
             // ale czasami użytkownicy mogą chcieć zgłosić własną "zhackowaną" wiadomość.
        }


        const report = await Report.create({
            reportedBy: req.user._id, // ID zalogowanego użytkownika
            reportedUser: reportedUserId || null,
            reportedMessage: reportedMessageId || null,
            reportType,
            reason
        });

        res.status(201).json({ message: 'Report submitted successfully. We will review it shortly.', report });
    } catch (error) {
        console.error('Create Report Error:', error);
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(val => val.message);
            return res.status(400).json({ message: messages.join(', ') });
        }
        res.status(500).json({ message: 'Server error submitting report.' });
    }
};

module.exports = { createReport };