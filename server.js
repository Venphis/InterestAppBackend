// server.js
const http = require('http');
const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const path = require('path');
const connectDB = require('./config/db');
const logAuditEvent = require('./utils/auditLogger'); // Upewnij się, że ścieżka jest poprawna

// Import Route'ów
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

dotenv.config(); // Załaduj zmienne środowiskowe na samym początku

const app = express();

// --- Podstawowe Middleware ---
app.use(cors()); // Włącz CORS dla wszystkich żądań
app.use(helmet()); // Dodaj nagłówki bezpieczeństwa

// Rate Limiting (nie stosuj w środowisku testowym)
if (process.env.NODE_ENV !== 'test') {
    const limiter = rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minut
        max: 200, // Maksymalna liczba żądań z jednego IP w oknie czasowym
        standardHeaders: true,
        legacyHeaders: false,
        message: 'Too many requests from this IP, please try again after 15 minutes'
    });
    app.use('/api', limiter); // Zastosuj do wszystkich tras /api
}

app.use(express.json()); // Do parsowania JSON w body requestów
app.use('/public', express.static(path.join(__dirname, 'public'))); // Serwowanie plików statycznych

// --- Główny Endpoint Aplikacji ---
app.get('/', (req, res) => {
  res.send(`API for ${process.env.APP_NAME || 'Social App'} is running in ${process.env.NODE_ENV || 'development'} mode...`);
});

// --- Definicje Tras API ---
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/friendships', friendshipRoutes);
app.use('/api/public/interests', publicInterestRoutes);
app.use('/api/reports', reportRoutes);

// Admin Routes
app.use('/api/admin/auth', adminAuthRoutes);
app.use('/api/admin/users', adminUserRoutes);
app.use('/api/admin/reports', adminReportRoutes);
app.use('/api/admin/interests', adminInterestRoutes);
app.use('/api/admin/management', adminManagementRoutes);
app.use('/api/admin/audit-logs', adminAuditLogRoutes);

// --- Konfiguracja Serwera HTTP i Socket.IO ---
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  pingTimeout: 60000,
  cors: {
    origin: "*", // W produkcji zmień na konkretny adres URL Twojego frontendu
    methods: ["GET", "POST", "PUT", "DELETE"]
  },
});
app.set('socketio', io); // Udostępnij instancję io dla kontrolerów (np. do wysyłania wiadomości)

let onlineUsers = {}; // Zdefiniuj onlineUsers w odpowiednim zasięgu

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
      socket.join(userData._id.toString()); // Dołącz do pokoju o nazwie równej ID użytkownika
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
          // Upewnij się, że participant i senderId są poprawne i mają _id
          if (participant && participant._id && newMessageReceived.senderId && newMessageReceived.senderId._id) {
              if (participant._id.toString() === newMessageReceived.senderId._id.toString()) return;

              // Sprawdź, czy odbiorca jest online
              // const recipientSocketId = onlineUsers[participant._id.toString()]; // Sprawdź, czy to działa, czy onlineUsers jest dostępne
              // if (recipientSocketId) {
              //   io.to(recipientSocketId).emit("message received", newMessageReceived);
              // } else {
              // Wysyłaj do pokoju użytkownika, jeśli jest online, serwer Socket.IO sam obsłuży dostarczenie
              io.to(participant._id.toString()).emit("message received", newMessageReceived);
              if (process.env.NODE_ENV !== 'test') console.log(`Socket.io: Emitted 'message received' to room ${participant._id.toString()}`);
              // }
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
              // io.emit('user_offline', userId); // Opcjonalnie, powiadom innych
              break;
          }
      }
  });
});

// --- Globalna Obsługa Błędów (na samym końcu) ---
app.use((req, res, next) => {
    const error = new Error(`Not Found - ${req.originalUrl}`);
    error.status = 404; // Dodaj status do błędu
    next(error);
});

app.use(async (err, req, res, next) => { // Dodano async dla logAuditEvent
    const statusCode = err.status || (res.statusCode === 200 ? 500 : res.statusCode);
    const errorMessage = err.message || 'Internal Server Error';

    if (process.env.NODE_ENV !== 'test') {
        console.error("GLOBAL ERROR HANDLER:", errorMessage, (process.env.NODE_ENV === 'development' ? err.stack : ''));
    } else {
        // Dla testów, warto zobaczyć pełny stack trace błędu, który tam dociera
        // console.error("GLOBAL ERROR HANDLER (TEST ENV):", err.name, err.message);
        // console.error(err.stack); // <-- OD<x_bin_472> TO DLA TESTÓW
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
        //stack: process.env.NODE_ENV === 'production' ? null : err.stack, // Stack tylko w dev
    });
});


const PORT = process.env.PORT || 5000;

// Uruchomienie serwera i połączenie z bazą danych
// Wykonaj to tylko, jeśli plik jest uruchamiany bezpośrednio (nie importowany)
// ORAZ jeśli NODE_ENV nie jest 'test' (testy mają własny setup)
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
    // Jeśli server.js jest importowany (np. przez inny skrypt, ale nie testowy),
    // tylko połącz z bazą, nie uruchamiaj serwera HTTP.
    connectDB().catch(err => console.error("DB connection failed on import (non-test):", err));
}

module.exports = app; // Eksportuj `app` dla Supertest