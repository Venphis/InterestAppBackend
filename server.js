// server.js
const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const connectDB = require('./config/db');
const http = require('http');
const { Server } = require("socket.io");

// Import Route'ów
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const chatRoutes = require('./routes/chatRoutes');
const messageRoutes = require('./routes/messageRoutes');
const friendshipRoutes = require('./routes/friendshipRoutes'); // <-- Nowy import

dotenv.config();
connectDB();

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('API is running...');
});

// Użycie Route'ów
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes); // Zawiera teraz /profile, /search, /profile/interests, /interests
app.use('/api/chats', chatRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/friendships', friendshipRoutes); // <-- Nowe użycie

// --- Konfiguracja Serwera HTTP i Socket.IO ---
const httpServer = http.createServer(app); // Stwórz serwer HTTP z aplikacji Express
const io = new Server(httpServer, { // Utwórz instancję serwera Socket.IO
  pingTimeout: 60000, // Czas bez aktywności przed rozłączeniem
  cors: {
    origin: "*", // W produkcji ustaw konkretny adres frontendu! Np. adres Twojej aplikacji lub localhost podczas testów
    // credentials: true // Jeśli używasz ciasteczek/sesji
  },
});

// Mapa do przechowywania online użytkowników { userId: socketId }
let onlineUsers = {};

io.on("connection", (socket) => {
  console.log("Connected to socket.io:", socket.id);

  // Kiedy użytkownik się łączy (np. po zalogowaniu w apce)
  socket.on('setup', (userData) => {
      if (!userData || !userData._id) {
          console.log("Invalid user data on setup");
          return;
      }
      console.log(`User ${userData.username} (${userData._id}) connected with socket ${socket.id}`);
      socket.join(userData._id); // Dołącz do pokoju o nazwie równej ID użytkownika
      onlineUsers[userData._id] = socket.id; // Zapisz, że użytkownik jest online
      socket.emit('connected'); // Wyślij potwierdzenie połączenia do klienta
      // Można wysłać listę online znajomych
      // io.emit('onlineUsers', Object.keys(onlineUsers)); // Informuj wszystkich (lub tylko znajomych) kto jest online
  });

  // Kiedy użytkownik dołącza do konkretnego czatu (np. po otwarciu ekranu czatu)
  socket.on('join chat', (room) => {
    socket.join(room); // Dołącz do pokoju o nazwie równej ID czatu
    console.log("User " + socket.id + " joined Room: " + room);
  });

  // Kiedy nowa wiadomość jest wysyłana (triggered z kontrolera sendMessage lub bezpośrednio z klienta)
  // Lepszym podejściem jest triggerowanie tego po zapisie w DB w kontrolerze,
  // ale dla uproszczenia zrobimy nasłuch bezpośrednio tutaj
  socket.on('new message', (newMessageReceived) => {
      const chat = newMessageReceived.chatId; // Odczytaj obiekt czatu z wiadomości

      if (!chat || !chat.participants) return console.log("Chat or participants not defined");

      // Wyślij wiadomość do wszystkich uczestników czatu OPRÓCZ nadawcy
      chat.participants.forEach((user) => {
          if (user._id == newMessageReceived.senderId._id) return; // Nie wysyłaj do samego siebie

          // Sprawdź czy odbiorca jest online
          const recipientSocketId = onlineUsers[user._id];
          if (recipientSocketId) {
               // Wyślij wiadomość do konkretnego socketa odbiorcy LUB do jego pokoju (userId)
               // Użycie pokoju jest bardziej elastyczne jeśli użytkownik ma >1 połączenie
               console.log(`Sending message to user ${user._id} in room ${user._id}`);
               io.to(user._id).emit("message received", newMessageReceived);
          } else {
               console.log(`User ${user._id} is offline, message will be fetched later.`);
               // Tutaj można dodać logikę powiadomień Push
          }
      });
  });

  // Obsługa pisania (typing indicators) - opcjonalne
  socket.on('typing', (room) => socket.in(room).emit('typing', room)); // Przekaż info o pisaniu do innych w pokoju
  socket.on('stop typing', (room) => socket.in(room).emit('stop typing', room));

  // Kiedy użytkownik się rozłącza
  socket.on("disconnect", () => {
      console.log("USER DISCONNECTED", socket.id);
      // Usuń użytkownika z listy online
      for (const userId in onlineUsers) {
          if (onlineUsers[userId] === socket.id) {
              delete onlineUsers[userId];
              console.log(`User ${userId} disconnected`);
              // io.emit('onlineUsers', Object.keys(onlineUsers)); // Zaktualizuj listę online dla innych
              break;
          }
      }
  });
});

// --- Uruchomienie Serwera ---
const PORT = process.env.PORT || 5000; // Użyj portu z .env lub domyślnie 5000

httpServer.listen(PORT, () => console.log(`Server running on port ${PORT}`)); // Uruchom serwer HTTP (który zawiera Express i Socket.IO)