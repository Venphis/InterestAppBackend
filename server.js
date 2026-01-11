// Main entry point: initializes Express, MongoDB, Socket.io, and API routes
const http = require('http');
const path = require('path');
const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Server } = require("socket.io");

// Local config and utilities
const connectDB = require('./config/db');
const logAuditEvent = require('./utils/auditLogger');
const { ensurePolishLanguage } = require('./utils/seedLanguages');

// Route imports
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const chatRoutes = require('./routes/chatRoutes');
const messageRoutes = require('./routes/messageRoutes');
const friendshipRoutes = require('./routes/friendshipRoutes');
const publicInterestRoutes = require('./routes/publicInterestRoutes');
const reportRoutes = require('./routes/reportRoutes');
const keyRoutes = require('./routes/keyRoutes');
const backupRoutes = require('./routes/backupRoutes');
const certificateRoutes = require('./routes/certificateRoutes');

// Admin route imports
const adminAuthRoutes = require('./routes/adminAuthRoutes');
const adminUserRoutes = require('./routes/adminUserRoutes');
const adminReportRoutes = require('./routes/adminReportRoutes');
const adminInterestRoutes = require('./routes/adminInterestRoutes');
const adminManagementRoutes = require('./routes/adminManagementRoutes');
const adminAuditLogRoutes = require('./routes/adminAuditLogRoutes');
const adminLanguageRoutes = require('./routes/adminLanguageRoutes');

// socket related imports
const { setupSocketCallbacks } = require('./socket/setupSocketCallbacks')

dotenv.config();

// Fail fast: verify critical JWT secrets before starting
const adminSecret = process.env.JWT_ADMIN_SECRET || process.env.JWT_SECRET;
if (!adminSecret || adminSecret.length < 16) {
  console.error('FATAL: JWT_ADMIN_SECRET missing or too short.');
  process.exit(1);
}

const app = express();

// Trust proxy for correct IP resolution behind Nginx/Docker
app.set('trust proxy', 1);

app.use(cors());
app.use(helmet());

// Rate limiting (skip in test environment)
if (process.env.NODE_ENV !== 'test') {
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many requests, please try again later'
  });
  app.use('/api', limiter);
}

// Parse bodies with increased limit for file uploads
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

app.use('/public', express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.send(`API is running.`);
});

// Socket.io setup
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  pingTimeout: 60000,
  cors: { origin: "*", methods: ["GET", "POST", "PUT", "DELETE"] },
});

// Expose Socket.io instance to the app
app.set('socketio', io);

setupSocketCallbacks(io);

// Register API routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/friendships', friendshipRoutes);
app.use('/api/public/interests', publicInterestRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/certificates', certificateRoutes);
app.use('/api/keys', keyRoutes);
app.use('/api/backups', backupRoutes);

// Register Admin API routes
app.use('/api/admin/auth', adminAuthRoutes);
app.use('/api/admin/users', adminUserRoutes);
app.use('/api/admin/reports', adminReportRoutes);
app.use('/api/admin/interests', adminInterestRoutes);
app.use('/api/admin/management', adminManagementRoutes);
app.use('/api/admin/audit-logs', adminAuditLogRoutes);
app.use('/api/admin/languages', adminLanguageRoutes);

// 404 Handler
app.use((req, res, next) => {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  error.status = 404;
  next(error);
});

// Global Error Handler
app.use(async (err, req, res, next) => {
  const statusCode = err.status || (res.statusCode === 200 ? 500 : res.statusCode);
  const errorMessage = err.message || 'Internal Server Error';

  if (process.env.NODE_ENV !== 'test') console.error("Error:", errorMessage);

  // Attempt to log system errors to audit log
  try {
    await logAuditEvent(
      'server_error_occurred',
      { type: 'system' },
      statusCode >= 500 ? 'critical' : 'error',
      {},
      { message: errorMessage, url: req.originalUrl, method: req.method },
      req
    );
  } catch (e) { /* Ignore logging errors */ }

  res.status(statusCode).json({ message: errorMessage });
});

const PORT = process.env.PORT || 5000;

// Start server if run directly
if (require.main === module && process.env.NODE_ENV !== 'test') {
  connectDB().then(async () => {
    await ensurePolishLanguage();
    httpServer.listen(PORT, () => console.log(`Server running on PORT ${PORT}`));
  }).catch(err => {
    console.error("DB Connection Failed:", err);
    process.exit(1);
  });
} else if (process.env.NODE_ENV !== 'test') {
  connectDB().catch(err => console.error("DB Connection Error:", err));
}

module.exports = app;
