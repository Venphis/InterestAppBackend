const http = require('http');
const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const path = require('path');
const connectDB = require('./config/db');
const logAuditEvent = require('./utils/auditLogger');

const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const chatRoutes = require('./routes/chatRoutes');
const messageRoutes = require('./routes/messageRoutes');
const friendshipRoutes = require('./routes/friendshipRoutes');
const publicInterestRoutes = require('./routes/publicInterestRoutes');
const reportRoutes = require('./routes/reportRoutes');

const adminAuthRoutes = require('./routes/adminAuthRoutes');
const adminUserRoutes = require('./routes/adminUserRoutes');
const adminReportRoutes = require('./routes/adminReportRoutes');
const adminInterestRoutes = require('./routes/adminInterestRoutes');
const adminManagementRoutes = require('./routes/adminManagementRoutes');
const adminAuditLogRoutes = require('./routes/adminAuditLogRoutes');

const { Server } = require("socket.io");
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

dotenv.config();

const app = express();
app.set('trust proxy', 1);
app.use(cors());
app.use(helmet());

if (process.env.NODE_ENV !== 'test') {
    const limiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 200,
        standardHeaders: true,
        legacyHeaders: false,
        message: 'Too many requests from this IP, please try again after 15 minutes'
    });
    app.use('/api', limiter);
}

app.use(express.json());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use('/public', express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.send(`API for ${process.env.APP_NAME || 'Social App'} is running in ${process.env.NODE_ENV || 'development'} mode...`);
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/friendships', friendshipRoutes);
app.use('/api/public/interests', publicInterestRoutes);
app.use('/api/reports', reportRoutes);

app.use('/api/admin/auth', adminAuthRoutes);
app.use('/api/admin/users', adminUserRoutes);
app.use('/api/admin/reports', adminReportRoutes);
app.use('/api/admin/interests', adminInterestRoutes);
app.use('/api/admin/management', adminManagementRoutes);
app.use('/api/admin/audit-logs', adminAuditLogRoutes);

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  pingTimeout: 60000,
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"]
  },
});
app.set('socketio', io);

let onlineUsers = {};

io.on("connection", (socket) => {
  if (process.env.NODE_ENV !== 'test') {
    console.log("Socket.io: Client connected:", socket.id);
  }

  socket.on('setup', (userData) => {
      if (!userData || !userData._id) {
          if (process.env.NODE_ENV !== 'test') console.log("Socket.io: Invalid user data on setup");
          return;
      }
      if (process.env.NODE_ENV !== 'test') console.log(`Socket.io: User ${userData.username} (${userData._id}) setup with socket ${socket.id}`);
      socket.join(userData._id.toString());
      onlineUsers[userData._id.toString()] = socket.id;
      socket.emit('connected');
  });

  socket.on('join chat', (room) => {
    socket.join(room.toString());
    if (process.env.NODE_ENV !== 'test') console.log("Socket.io: User " + socket.id + " joined Room: " + room);
  });

  socket.on('new message', (newMessageReceived) => {
      const chat = newMessageReceived.chatId;
      if (!chat || !chat.participants) {
          if (process.env.NODE_ENV !== 'test') console.log("Socket.io: 'new message' - Chat or participants not defined in message:", newMessageReceived);
          return;
      }

      chat.participants.forEach((participant) => {
          if (participant && participant._id && newMessageReceived.senderId && newMessageReceived.senderId._id) {
              if (participant._id.toString() === newMessageReceived.senderId._id.toString()) return;
              io.to(participant._id.toString()).emit("message received", newMessageReceived);
              if (process.env.NODE_ENV !== 'test') console.log(`Socket.io: Emitted 'message received' to room ${participant._id.toString()}`);
          }
      });
  });

  socket.on('typing', (room) => socket.in(room.toString()).emit('typing', room));
  socket.on('stop typing', (room) => socket.in(room.toString()).emit('stop typing', room));

  socket.on("disconnect", () => {
    if (process.env.NODE_ENV !== 'test') console.log("Socket.io: Client disconnected", socket.id);
      for (const userId in onlineUsers) {
          if (onlineUsers[userId] === socket.id) {
              delete onlineUsers[userId];
              if (process.env.NODE_ENV !== 'test') console.log(`Socket.io: User ${userId} removed from online users`);
              break;
          }
      }
  });
});

app.use((req, res, next) => {
    const error = new Error(`Not Found - ${req.originalUrl}`);
    error.status = 404;
    next(error);
});

app.use(async (err, req, res, next) => { 
    const statusCode = err.status || (res.statusCode === 200 ? 500 : res.statusCode);
    const errorMessage = err.message || 'Internal Server Error';

    if (process.env.NODE_ENV !== 'test') {
        console.error("GLOBAL ERROR HANDLER:", errorMessage, (process.env.NODE_ENV === 'development' ? err.stack : ''));
    }

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
        console.error("CRITICAL: Failed to log server error to audit log:", logError);
    }

    res.status(statusCode).json({
        message: errorMessage,
    });
});


const PORT = process.env.PORT || 5000;

if (require.main === module && process.env.NODE_ENV !== 'test') {
    connectDB().then(() => {
        httpServer.listen(PORT, () => {
            console.log(`Server running on PORT ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
        });
    }).catch(err => {
        console.error("FATAL: Failed to connect to MongoDB. Server not started.", err);
        process.exit(1);
    });
} else if (process.env.NODE_ENV !== 'test') {
    connectDB().catch(err => console.error("DB connection failed on import (non-test):", err));
}

module.exports = app;