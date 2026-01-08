const Chat = require('../models/Chat');
const Message = require('../models/Message');
const User = require('../models/User');
const Friendship = require('../models/Friendship');
const { validationResult } = require('express-validator');

// Create or retrieve 1-on-1 chat
const accessChat = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { userId } = req.body;
    const currentUserId = req.user._id;

    if (currentUserId.equals(userId)) return res.status(400).json({ message: 'Self-chat not allowed' });

    try {
        const recipient = await User.findOne({ _id: userId, isDeleted: false, isBanned: false });
        if (!recipient) return res.status(404).json({ message: "Recipient unavailable" });

        // Find existing chat
        let chat = await Chat.findOne({
            participants: { $all: [currentUserId, userId], $size: 2 }
        })
        .populate({ path: "participants", select: "-password -emailVerificationToken -passwordResetToken", match: { isDeleted: false } })
        .populate({ path: "lastMessage", select: "-__v" });

        if (chat) {
            if (chat.participants.length < 2) return res.status(404).json({ message: 'Chat inactive' });
            return res.status(200).json(chat);
        }

        // Create new chat
        const newChat = await Chat.create({ participants: [currentUserId, userId] });
        const fullChat = await Chat.findById(newChat._id)
            .populate({ path: "participants", select: "-password -emailVerificationToken -passwordResetToken", match: { isDeleted: false } });

        res.status(200).json(fullChat);
    } catch (error) {
        console.error('Access Chat Error:', error.message);
        next(error);
    }
};

// Retrieve all chats for user
const fetchChats = async (req, res, next) => {
    try {
        const chats = await Chat.find({ participants: { $elemMatch: { $eq: req.user._id } } })
            .populate({ path: "participants", select: "_id", match: { isDeleted: false } })
            .populate({ path: "lastMessage", select: "-__v" })
            .sort({ lastMessageTimestamp: -1 })
            .lean();

        // Filter out chats with deleted participants and normalize format
        const validChats = chats
            .filter(chat => chat.participants && chat.participants.length > 1)
            .map(chat => ({ ...chat, participants: chat.participants.map(p => p._id) }));

        res.status(200).json(validChats);
    } catch (error) {
        console.error('Fetch Chats Error:', error.message);
        next(error);
    }
};

// Send message to a chat
const sendMessage = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { content, chatId } = req.body;
    const senderId = req.user._id;

    try {
        const chat = await Chat.findOne({ _id: chatId, participants: senderId }).populate('participants');
        if (!chat) return res.status(404).json({ message: "Chat not found" });

        // Check for blocks
        if (chat.participants.length === 2) {
            const recipient = chat.participants.find(p => !p._id.equals(senderId));
            if (recipient) {
                const blocked = await Friendship.exists({
                    $or: [
                        { user1: senderId, user2: recipient._id, isBlocked: true },
                        { user1: recipient._id, user2: senderId, isBlocked: true }
                    ]
                });
                if (blocked) return res.status(403).json({ message: "Blocked" });
            }
        }

        const message = await Message.create({ senderId, content, chatId });

        await Chat.findByIdAndUpdate(chatId, {
            lastMessage: message._id,
            lastMessageTimestamp: message.createdAt
        });

        // Real-time delivery
        const io = req.app.get('socketio');
        if (io) {
            chat.participants.forEach(p => {
                if (!p._id.equals(senderId)) {
                    io.to(p._id.toString()).emit("message received", message.toObject());
                }
            });
        }

        const result = message.toObject();
        delete result.__v;
        res.status(200).json(result);

    } catch (error) {
        console.error('Send Message Error:', error.message);
        next(error);
    }
};

// Retrieve messages with pagination and key rotation logic
const allMessages = async (req, res, next) => {
    try {
        const chat = await Chat.findOne({ _id: req.params.chatId, participants: req.user._id });
        if (!chat) return res.status(403).json({ message: "Unauthorized" });

        const limit = parseInt(req.query.limit) || 20;
        const page = parseInt(req.query.page) || 1;
        const skip = (page - 1) * limit;

        const currentUser = await User.findById(req.user._id);

        // Calculate visibility cutoff date based on key rotation or chat resets
        const dates = [];
        if (chat.lastResetDate) dates.push(new Date(chat.lastResetDate));
        if (currentUser?.lastKeyRotationDate) dates.push(new Date(currentUser.lastKeyRotationDate));
        
        const cutoffDate = dates.length ? new Date(Math.max(...dates)) : null;

        const query = { chatId: req.params.chatId };
        if (cutoffDate) query.createdAt = { $gte: cutoffDate };

        const [messages, totalMessages] = await Promise.all([
            Message.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).select('-__v'),
            Message.countDocuments(query)
        ]);

        // Check if history was truncated
        let historyTruncated = false;
        if (cutoffDate) {
            const olderCount = await Message.countDocuments({ chatId: req.params.chatId, createdAt: { $lt: cutoffDate } });
            historyTruncated = olderCount > 0;
        }

        res.json({
            messages: messages.reverse(),
            currentPage: page,
            totalPages: Math.ceil(totalMessages / limit),
            totalMessages,
            historyUnavailableReason: historyTruncated ? 'key_rotation' : null,
            effectiveHistoryStartDate: cutoffDate
        });
    } catch (error) {
        console.error('Fetch Messages Error:', error.message);
        next(error);
    }
};

module.exports = { accessChat, fetchChats, sendMessage, allMessages };