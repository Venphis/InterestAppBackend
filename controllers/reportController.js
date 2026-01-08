const Report = require('../models/Report');
const User = require('../models/User');
const Message = require('../models/Message');
const { validationResult } = require('express-validator');

// Create a new user/message report
const createReport = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { reportedUserId, reportedMessageId, reportType, reason } = req.body;
    const reporterId = req.user._id;

    // Validate request integrity
    if (!reportType || !reason) {
        return res.status(400).json({ message: 'Type and reason required' });
    }
    if (!reportedUserId && !reportedMessageId) {
        return res.status(400).json({ message: 'Target (user/message) required' });
    }

    try {
        // Validate target User
        if (reportedUserId) {
            if (reportedUserId === reporterId.toString()) {
                return res.status(400).json({ message: 'Cannot report self' });
            }
            const targetUser = await User.findById(reportedUserId);
            if (!targetUser) return res.status(404).json({ message: 'Target user not found' });
        }

        // Validate target Message
        if (reportedMessageId) {
            const targetMessage = await Message.findById(reportedMessageId);
            if (!targetMessage) return res.status(404).json({ message: 'Target message not found' });
        }

        const report = await Report.create({
            reportedBy: reporterId,
            reportedUser: reportedUserId || null,
            reportedMessage: reportedMessageId || null,
            reportType,
            reason
        });

        res.status(201).json({ message: 'Report submitted', report });
    } catch (error) {
        console.error('Create Report Error:', error.message);
        next(error);
    }
};

module.exports = { createReport };