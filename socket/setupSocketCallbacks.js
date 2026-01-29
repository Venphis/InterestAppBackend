const { SOCKET_EVENT } = require('./WSEvent');
const { authorizeSocket } = require('./authorizeSocket')
const Chat = require('../models/Chat');
const Message = require('../models/Message');

let onlineUsers = new Set();

const setupSocketCallbacks = (io) => {
    io.use(authorizeSocket);

    io.on("connection", (socket) => {

        if (socket.failedAuth === true) {
            console.error('[SocketAuth] Failed');
            socket.emit(SOCKET_EVENT.FAILED_AUTH, `${socket.errorMessage}`)
            socket.disconnect(true);
            return;
        }

        const userId = socket.user._id.toString();

        if (process.env.NODE_ENV !== 'test') console.log("Client connected:", userId);

        if (socket.user.isBanned) {
            socket.emit(SOCKET_EVENT.BAN, "{}")
            socket.disconnect(true);
            return;
        }

        socket.join(userId);
        onlineUsers.add(userId);
        
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

            chat.participants.forEach((participant) => {
                console.log("out receive", JSON.stringify(message));
                io.to(participant._id.toString()).emit(SOCKET_EVENT.RECEIVE, message)
            });
        });

        socket.on(SOCKET_EVENT.WRITING_START, async (chatId) => {
            console.log("in writing start", chatId);
            const senderId = socket.user._id.toString();
            const chat = await Chat.findOne({
                _id: chatId,
                participants: senderId
            }).populate('participants');

            chat.participants.forEach((participant) => {
                const participantId = participant._id.toString()
                if(participantId != senderId) {
                    io.to(participantId).emit(SOCKET_EVENT.WRITING_START, chatId)
                }
            });
        }); 

        socket.on(SOCKET_EVENT.WRITING_STOP, async (chatId) => {
            console.log("in writing stop", chatId);
            const senderId = socket.user._id.toString();
            const chat = await Chat.findOne({
                _id: chatId,
                participants: senderId
            }).populate('participants');

            chat.participants.forEach((participant) => {
                const participantId = participant._id.toString()
                if(participantId != senderId) {
                    io.to(participantId).emit(SOCKET_EVENT.WRITING_STOP, chatId)
                }
            });
        });

        socket.on("disconnect", () => {
            if (process.env.NODE_ENV !== 'test') console.log("Client disconnected:", userId);
            onlineUsers.delete(userId);
        });
    });
}

module.exports = { setupSocketCallbacks };
