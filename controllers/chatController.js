const Chat = require('../models/Chat');
const Message = require('../models/Message');
const User = require('../models/User');
const Friendship = require('../models/Friendship');
const { validationResult } = require('express-validator');
const mongoose = require('mongoose');

const accessChat = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { userId } = req.body;
    const currentUserId = req.user._id;

    if (currentUserId.equals(userId)) {
        return res.status(400).json({ message: 'Cannot create a chat with yourself' });
    }

    try {
        const recipientUser = await User.findOne({ _id: userId, isDeleted: false, isBanned: false });
        if (!recipientUser) return res.status(404).json({ message: "Recipient user not found, deleted, or banned" });

        let chat = await Chat.findOne({
            participants: { $all: [currentUserId, userId], $size: 2 } 
        })
        .populate({ path: "participants", select: "-password -emailVerificationToken -passwordResetToken", match: { isDeleted: false } })
        .populate({ path: "lastMessage", select: "-__v"  })

        if (chat) {
            if (chat.participants.length < 2) { 
                return res.status(404).json({ message: 'Chat is inaccessible as one of the participants is inactive.' });
            }
            return res.status(200).json(chat);
        }

        const chatData = { participants: [currentUserId, userId] };
        const createdChat = await Chat.create(chatData);
        const fullChat = await Chat.findOne({ _id: createdChat._id })
            .populate({ path: "participants", select: "-password -emailVerificationToken -passwordResetToken -__v", match: { isDeleted: false } });

        res.status(200).json(fullChat);

    } catch (error) {
        console.error('[chatCtrl] Access Chat Error:', error);
        next(error);
    }
};

const fetchChats = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    try {
        const chats = await Chat.find({ participants: { $elemMatch: { $eq: req.user._id } } })
            .populate({ path: "participants", select: "_id", match: { isDeleted: false } })
            .populate({ path: "lastMessage", select: "-__v"  })
            .sort({ lastMessageTimestamp: -1 })
            .lean(); 

        const validChats = chats.filter(chat => chat.participants && chat.participants.length > 1);
        const validChatsMapped = validChats.map(chat => {
            return {
                ...chat,
                participants: chat.participants.map(participant => participant._id)
            };
        });
        res.status(200).json(validChatsMapped);
    } catch (error) {
        console.error('[chatCtrl] Fetch Chats Error:', error);
        next(error);
    }
};

const sendMessage = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { content, chatId } = req.body;
    const senderId = req.user._id;

    try {
        const chat = await Chat.findOne({
            _id: chatId,
            participants: senderId
        }).populate('participants');

        if (!chat) {
            return res.status(404).json({ message: "Chat not found or you are not a participant." });
        }

        if (chat.participants.length === 2) {
            const recipient = chat.participants.find(p => !p._id.equals(senderId));
            if (recipient) {
                const friendship = await Friendship.findOne({
                    $or: [ { user1: senderId, user2: recipient._id }, { user1: recipient._id, user2: senderId } ]
                });
                if (friendship && friendship.isBlocked) {
                    return res.status(403).json({ message: "Cannot send message, user is blocked." });
                }
            }
        }
        
        let message = await Message.create({ senderId, content, chatId });

        await Chat.findByIdAndUpdate(chatId, {
            lastMessage: message._id,
            lastMessageTimestamp: message.createdAt
        });

        const io = req.app.get('socketio');
        if (io && message.chatId && chat.participants) {
             chat.participants.forEach((participant) => {
                 if (participant && participant._id && !participant._id.equals(senderId)) {
                    // Wyślij cały obiekt wiadomości, klient sam wybierze, co odszyfrować
                    io.to(participant._id.toString()).emit("message received", message.toObject());
                 }
             });
        }

        message = message.toObject();
        delete message.__v;       
        res.status(200).json(message); 

    } catch (error) {
        console.error('[chatCtrl] Send Message Error:', error);
        next(error);
    }
};

const allMessages = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
        // 1. Sprawdź dostęp do czatu
        const chat = await Chat.findOne({ _id: req.params.chatId, participants: req.user._id });
        if (!chat) {
            return res.status(403).json({ message: "You are not authorized to view messages for this chat." });
        }

        const limit = parseInt(req.query.limit) || 20;
        const page = parseInt(req.query.page) || 1;
        const skip = (page - 1) * limit;

        // 2. Pobierz aktualnego użytkownika (rotacja klucza może ucinać historię)
        const currentUser = await User.findById(req.user._id);

        // --- WYLICZ "CUT-OFF" DLA HISTORII ---
        // Jeśli masz chat.lastResetDate (np. globalny reset czatu) i/lub currentUser.lastKeyRotationDate,
        // to wiadomości starsze niż ta data są dla tego usera "niedostępne" (nie do odszyfrowania).
        const candidateDates = [];
        if (chat.lastResetDate) candidateDates.push(new Date(chat.lastResetDate));
        if (currentUser?.lastKeyRotationDate) candidateDates.push(new Date(currentUser.lastKeyRotationDate));

        const effectiveCutoffDate =
            candidateDates.length > 0
                ? new Date(Math.max(...candidateDates.map(d => d.getTime())))
                : null;

        // 3. Pobierz wiadomości (content jest String — nie filtrujemy po `content.<userId>`)
        const baseQuery = { chatId: req.params.chatId };
        if (effectiveCutoffDate) {
            baseQuery.createdAt = { $gte: effectiveCutoffDate };
        }

        const totalMessages = await Message.countDocuments(baseQuery);

        const messages = await Message.find(baseQuery)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .select('-__v');

        // 4. Sprawdź, czy jest "dziura" w historii (były starsze wiadomości, ale są ucięte)
        let historyTruncated = false;
        if (effectiveCutoffDate) {
            const olderMessagesCount = await Message.countDocuments({
                chatId: req.params.chatId,
                createdAt: { $lt: effectiveCutoffDate }
            });
            historyTruncated = olderMessagesCount > 0;
        }

        // 5. Odpowiedź
        res.json({
            messages: messages.reverse(),
            currentPage: page,
            totalPages: Math.ceil(totalMessages / limit),
            totalMessages,

            historyUnavailableReason: historyTruncated ? 'key_rotation' : null,
            lastKeyRotationDate: currentUser?.lastKeyRotationDate || null,

            // opcjonalnie (nie szkodzi, pomaga frontendowi/debugowi):
            lastResetDate: chat.lastResetDate || null,
            effectiveHistoryStartDate: effectiveCutoffDate
        });
    } catch (error) {
        console.error('[chatCtrl] Fetch Messages Error:', error);
        next(error);
    }
};

module.exports = { accessChat, fetchChats, sendMessage, allMessages };
