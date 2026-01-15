const logAuditEvent = require('../utils/auditLogger');

// 404 Handler
const notFound = (req, res, next) => {
    const error = new Error(`Not Found - ${req.originalUrl}`);
    error.status = 404;
    next(error);
};

// Global Error Handler
const globalErrorHandler = async (err, req, res, next) => {
    const statusCode = err.status || (res.statusCode === 200 ? 500 : res.statusCode);
    const errorMessage = err.message || 'Internal Server Error';

    if (process.env.NODE_ENV !== 'test') {
        console.error("GLOBAL ERROR HANDLER:", errorMessage, (process.env.NODE_ENV === 'development' ? err.stack : ''));
    }
    
    // Attempt to log system errors to audit log
    try {
        await logAuditEvent(
            'server_error_occurred', { type: 'system' },
            statusCode >= 500 ? 'critical' : 'error',
            {}, {
                message: errorMessage,
                stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
                url: req.originalUrl, method: req.method
            }, req
        );
    } catch (logError) {
        if (process.env.NODE_ENV !== 'test') {
             console.error("CRITICAL: Failed to log server error to audit log:", logError);
        }
    }

    res.status(statusCode).json({
        message: errorMessage,
        stack: process.env.NODE_ENV === 'production' ? null : err.stack,
    });
};

module.exports = { notFound, globalErrorHandler };