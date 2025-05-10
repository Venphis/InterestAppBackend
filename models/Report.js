// models/Report.js
const mongoose = require('mongoose');

const ReportSchema = new mongoose.Schema({
    reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    reportedUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Jeśli zgłaszany jest użytkownik
    reportedMessage: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' }, // Jeśli zgłaszana jest wiadomość
    // Można dodać reportedComment, reportedPost itp. w przyszłości

    reportType: {
        type: String,
        enum: ['spam', 'harassment', 'hate_speech', 'inappropriate_content', 'impersonation', 'scam', 'other'],
        required: [true, 'Report type is required']
    },
    reason: { // Szczegółowy opis od zgłaszającego
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
    adminNotes: { // Notatki od admina/moderatora
        type: String,
        default: ''
    },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser' } // Admin, który zajął się zgłoszeniem
}, { timestamps: true });

module.exports = mongoose.model('Report', ReportSchema);