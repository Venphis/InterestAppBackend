const { SOCKET_EVENT } = require('./WSEvent');
const { authorizeSocket } = require('./authorizeSocket')
const Chat = require('../models/Chat');
const Message = require('../models/Message');

let onlineUsers = {};

const setupSocketCallbacks = (io) => {
    io.use(authorizeSocket);

    io.on("connection", (socket) => {
        const userId = socket.user._id.toString();
        if (process.env.NODE_ENV !== 'test') console.log("Client connected:", userId);
        socket.join(userId);
        
        socket.on(SOCKET_EVENT.SEND, async (payload) => {
            console.log("in send", payload);
            const parsed = JSON.parse(payload);
            const content = parsed.content;
            const senderId = userId;
            const chatId = parsed.chatId;

            const chat = await Chat.findOne({
                _id: chatId,
                participants: senderId 
            }).populate('participants');

            if (!chat || !chat.participants) return;

            let message = await Message.create({ senderId, content, chatId });

            await Chat.findByIdAndUpdate(chatId, {
                lastMessage: message._id,
                lastMessageTimestamp: message.createdAt
            });

            message = message.toObject();
            delete message.__v;       

            console.log("out receive", JSON.stringify(message));
            chat.participants.forEach((participant) => {
                io.to(participant._id.toString()).emit(SOCKET_EVENT.RECEIVE, message)
            });
        });

        socket.on(SOCKET_EVENT.WRITING, async (chatId) => {
            console.log("in writing", chatId);
            const senderId = socket.user._id.toString();
            const chat = await Chat.findOne({
                _id: chatId,
                participants: senderId
            }).populate('participants');

            chat.participants.forEach((participant) => {
                const participantId = participant._id.toString()
                if(participantId != senderId) {
                    io.to(participantId).emit(SOCKET_EVENT.WRITING, chatId)
                }
            });
        }); 

        socket.on("disconnect", () => {
            if (process.env.NODE_ENV !== 'test') console.log("Client disconnected:", userId);
            Object.keys(onlineUsers).forEach(key => {
                if (onlineUsers[key] === socket.id) delete onlineUsers[key];
            });
        });
    });
}

module.exports = { setupSocketCallbacks };
