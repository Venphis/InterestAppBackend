const mongoose = require('mongoose');

const ReportSchema = new mongoose.Schema({
    reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    reportedUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, 
    reportedMessage: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' }, 

    reportType: {
        type: String,
        enum: ['spam', 'harassment', 'hate_speech', 'inappropriate_content', 'impersonation', 'scam', 'other'],
        required: [true, 'Report type is required']
    },
    reason: {
        type: String,
        required: [true, 'Reason for reporting is required'],
        trim: true,
        maxlength: [1000, 'Reason cannot be more than 1000 characters']
    },
    status: {
        type: String,
        enum: ['pending', 'under_review', 'action_taken', 'no_action_needed', 'resolved_with_reporter'],
        default: 'pending'
    },
    adminNotes: { 
        type: String,
        default: ''
    },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser' } 
}, { timestamps: true });

module.exports = mongoose.model('Report', ReportSchema);