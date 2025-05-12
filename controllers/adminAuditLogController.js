// controllers/adminAuditLogController.js
const AuditLog = require('../models/AuditLog');
const { validationResult } = require('express-validator');

// @desc    Get all audit logs (paginated, filterable)
// @route   GET /api/admin/audit-logs
// @access  Private (Superadmin usually, or specific admin role)
const getAuditLogs = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 25; // Więcej logów na stronę
    const skip = (page - 1) * limit;

    const query = {};
    if (req.query.level) query.level = req.query.level;
    if (req.query.action) query.action = { $regex: req.query.action, $options: 'i' };
    if (req.query.actorId) query.actorId = req.query.actorId;
    if (req.query.actorType) query.actorType = req.query.actorType;
    if (req.query.targetId) query.targetId = req.query.targetId;
    if (req.query.targetType) query.targetType = req.query.targetType;
    if (req.query.startDate) query.timestamp = { ...query.timestamp, $gte: new Date(req.query.startDate) };
    if (req.query.endDate) query.timestamp = { ...query.timestamp, $lte: new Date(req.query.endDate) };


    try {
        const logs = await AuditLog.find(query)
                                   .populate('actorId', 'username') // Populate username if actorId is User or AdminUser
                                   // .populate('targetId') // Może być różne, zależy od targetType
                                   .sort({ timestamp: -1 })
                                   .skip(skip)
                                   .limit(limit);

        const totalLogs = await AuditLog.countDocuments(query);

        res.json({
            logs,
            currentPage: page,
            totalPages: Math.ceil(totalLogs / limit),
            totalLogs,
        });
    } catch (error) {
        console.error('Admin Get Audit Logs Error:', error);
        res.status(500).json({ message: 'Server Error fetching audit logs.' });
    }
};

module.exports = { getAuditLogs };