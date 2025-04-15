// controllers/chatController.js
const Chat = require('../models/Chat');
const Message = require('../models/Message');
const User = require('../models/User');

// @desc    Create or access a chat between two users
// @route   POST /api/chats
// @access  Private
const accessChat = async (req, res) => {
  const { userId } = req.body; // ID drugiego użytkownika

  if (!userId) {
    console.log("UserId param not sent with request");
    return res.sendStatus(400);
  }

  const currentUser = req.user._id;

  try {
    // Sprawdź czy czat między tymi dwoma użytkownikami już istnieje
    let existingChat = await Chat.findOne({
      participants: { $all: [currentUser, userId] }
    })
    .populate("participants", "-password") // Pobierz dane uczestników bez hasła
    .populate("lastMessage"); // Pobierz ostatnią wiadomość

    // Jeśli czat istnieje, zwróć go
    if (existingChat) {
        // Można tu dodać logikę zapełnienia danych nadawcy ostatniej wiadomości, jeśli potrzebne
        // existingChat = await User.populate(existingChat, { path: "lastMessage.sender", select: "username email" });
        return res.status(200).json(existingChat);
    }

    // Jeśli czat nie istnieje, stwórz nowy
    const chatData = {
      // chatName: "sender", // Można dodać nazwę czatu, szczególnie dla grup
      participants: [currentUser, userId],
      // isGroupChat: false, // Domyślnie czat prywatny
    };

    const createdChat = await Chat.create(chatData);

    // Znajdź nowo utworzony czat i zapełnij danymi uczestników
    const fullChat = await Chat.findOne({ _id: createdChat._id })
                               .populate("participants", "-password");

    res.status(200).json(fullChat);

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error accessing/creating chat" });
  }
};

// @desc    Fetch all chats for a user
// @route   GET /api/chats
// @access  Private
const fetchChats = async (req, res) => {
  try {
    // Znajdź wszystkie czaty, w których uczestniczy zalogowany użytkownik
    const chats = await Chat.find({ participants: { $elemMatch: { $eq: req.user._id } } })
      .populate("participants", "-password")
      .populate("lastMessage")
      // Można dodać .populate("lastMessage.senderId", "username email") jeśli potrzebne
      .sort({ lastMessageTimestamp: -1 }); // Sortuj od najnowszej aktywności

    // Można tu dodać logikę zapełnienia danych nadawcy ostatniej wiadomości dla każdego czatu
    // const populatedChats = await User.populate(chats, { path: "lastMessage.sender", select: "username email profile.avatarUrl" });

    res.status(200).json(chats); // Zwróć posortowane czaty
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error fetching chats" });
  }
};

// @desc    Send a message
// @route   POST /api/messages
// @access  Private
const sendMessage = async (req, res) => {
    const { content, chatId } = req.body;

    if (!content || !chatId) {
        console.log("Invalid data passed into request");
        return res.sendStatus(400);
    }

    var newMessage = {
        senderId: req.user._id,
        content: content,
        chatId: chatId,
    };

    try {
        let message = await Message.create(newMessage);

        // Zapełnij dane nadawcy i czatu (uczestników)
        message = await message.populate("senderId", "username profile.avatarUrl"); // Dodaj .execPopulate() jeśli używasz starszej wersji Mongoose
        message = await message.populate("chatId");
        message = await User.populate(message, { // Zapełnij uczestników w czacie
            path: "chatId.participants",
            select: "username email profile.avatarUrl",
        });

         // Aktualizuj ostatnią wiadomość i timestamp w czacie
        await Chat.findByIdAndUpdate(req.body.chatId, {
            lastMessage: message._id,
            lastMessageTimestamp: message.createdAt
        });

        // Zwróć nowo utworzoną wiadomość
        res.json(message);

        // Tutaj wyślemy wiadomość przez Socket.IO do innych uczestników
        // Logikę Socket.IO dodamy w server.js

    } catch (error) {
        console.error(error);
        res.status(400).json({ message: "Error sending message: " + error.message });
    }
};

// @desc    Get all messages for a chat
// @route   GET /api/messages/:chatId
// @access  Private
const allMessages = async (req, res) => {
    try {
        // Pobierz wszystkie wiadomości dla danego chatId, posortowane od najnowszej
        // Dodaj .limit() i .skip() dla paginacji w przyszłości
        const messages = await Message.find({ chatId: req.params.chatId })
            .populate("senderId", "username email profile.avatarUrl") // Zapełnij dane nadawcy
            .populate("chatId") // Można pominąć jeśli nie potrzebujesz info o czacie tutaj
            .sort({ createdAt: -1 }); // Pobierz od najnowszych

        res.json(messages);
    } catch (error) {
        console.error(error);
        res.status(400).json({ message: "Error fetching messages: " + error.message });
    }
};


module.exports = { accessChat, fetchChats, sendMessage, allMessages };