const AuditLog = require('../models/AuditLog');
const { validationResult } = require('express-validator');

// Retrieves paginated audit logs with filtering capabilities
const getAuditLogs = async (req, res) => {
    // Validate request inputs
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 25;
    const skip = (page - 1) * limit;

    const { level, action, actorId, actorType, targetId, targetType, startDate, endDate } = req.query;
    const query = {};

    // Apply filters
    if (level) query.level = level;
    if (action) query.action = { $regex: action, $options: 'i' };
    if (actorId) query.actorId = actorId;
    if (actorType) query.actorType = actorType;
    if (targetId) query.targetId = targetId;
    if (targetType) query.targetType = targetType;

    // Apply date range filter
    if (startDate || endDate) {
        query.timestamp = {};
        if (startDate) query.timestamp.$gte = new Date(startDate);
        if (endDate) query.timestamp.$lte = new Date(endDate);
    }

    try {
        // Fetch logs and total count concurrently
        const [logs, totalLogs] = await Promise.all([
            AuditLog.find(query)
                .populate('actorId', 'username')
                .sort({ timestamp: -1 })
                .skip(skip)
                .limit(limit),
            AuditLog.countDocuments(query)
        ]);

        res.json({
            logs,
            currentPage: page,
            totalPages: Math.ceil(totalLogs / limit),
            totalLogs,
        });
    } catch (error) {
        console.error('AuditLog Fetch Error:', error.message);
        res.status(500).json({ message: 'Server Error fetching audit logs.' });
    }
};

module.exports = { getAuditLogs };