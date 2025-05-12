// controllers/chatController.js
const Chat = require('../models/Chat');
const Message = require('../models/Message');
const User = require('../models/User');
const { validationResult } = require('express-validator');

// @desc    Create or access a chat between two users
// @route   POST /api/chats
// @access  Private
const accessChat = async (req, res) => {
  const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
  const { userId } = req.body; // ID drugiego użytkownika

  if (!userId) {
    console.log("UserId param not sent with request");
    return res.sendStatus(400);
  }

  const currentUser = req.user._id;

  try {
    const recipientUser = await User.findOne({ _id: userId, isDeleted: false, isBanned: false });
    if (!recipientUser) return res.status(404).json({ message: "Recipient user not found or inactive" });

    // Sprawdź czy czat między tymi dwoma użytkownikami już istnieje
    let existingChat = await Chat.findOne({
      participants: { $all: [currentUser, userId] }
    })
    .populate({ path: "participants", select: "-password", match: { isDeleted: false } }) // Filtruj usuniętych
    .populate("lastMessage");

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
  const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
  try {
    // Znajdź wszystkie czaty, w których uczestniczy zalogowany użytkownik
    const chats = await Chat.find({ participants: { $elemMatch: { $eq: req.user._id } } })
    .populate({ path: "participants", select: "-password", match: { isDeleted: false } })
    .populate({
        path: "lastMessage",
        populate: { path: "senderId", select: "username profile.avatarUrl", match: { isDeleted: false } }
    })
    .sort({ lastMessageTimestamp: -1 });

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
  const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
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
        message = await message.populate({path: "senderId", select: "username profile.avatarUrl", match: {isDeleted: false}});
        message = await message.populate({
            path: "chatId",
            populate: { path: "participants", select: "username email profile.avatarUrl", match: {isDeleted: false} }
        });
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
  const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    try {
        // Pobierz wszystkie wiadomości dla danego chatId, posortowane od najnowszej
        // Dodaj .limit() i .skip() dla paginacji w przyszłości
        const messages = await Message.find({ chatId: req.params.chatId })
            .populate({path: "senderId", select: "username email profile.avatarUrl", match: {isDeleted: false}})
            .populate("chatId")
            .sort({ createdAt: -1 });

        res.json(messages);
    } catch (error) {
        console.error(error);
        res.status(400).json({ message: "Error fetching messages: " + error.message });
    }
};


module.exports = { accessChat, fetchChats, sendMessage, allMessages };