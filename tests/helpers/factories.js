const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// Models
const User = require('../../models/User');
const AdminUser = require('../../models/AdminUser');
const Report = require('../../models/Report');
const Message = require('../../models/Message');
const Chat = require('../../models/Chat');
const Interest = require('../../models/Interest');
const InterestCategory = require('../../models/InterestCategory');
const UserInterest = require('../../models/UserInterest');
const Friendship = require('../../models/Friendship');
const Language = require('../../models/Language');
const AuditLog = require('../../models/AuditLog');

// --- Utility Functions ---

const generateUnique = (prefix = '') => `${prefix}${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

const uniqueCategoryName = () => `cat_${crypto.randomBytes(6).toString('hex')}`;
global.uniqueCategoryName = uniqueCategoryName;

let userCounter = 0;
const uniqueUsername = (base = 'user') => `${base}_${Date.now()}_${++userCounter}`;

const uniqueLanguageCode = () => {
    const randomSuffix = crypto.randomBytes(2).toString('hex').slice(0, 2).toLowerCase();
    return `l${randomSuffix}`;
};

// --- Data Factory Methods ---

exports.createUser = async (overrides = {}) => {
    const defaults = {
        username: overrides.username || uniqueUsername('user'),
        email: overrides.email || `${uniqueUsername('email')}@example.com`,
        password: 'password123',
        isEmailVerified: false,
        isBanned: false,
        isDeleted: false,
        isTestAccount: false,
    };

    const data = { ...defaults, ...overrides };

    try {
        return await User.create(data);
    } catch (err) {
        if (err.code === 11000) {
            return await User.findOne({ username: data.username });
        }
        throw err;
    }
};

exports.createVerifiedUser = async (overrides = {}) => {
    return exports.createUser({ isEmailVerified: true, ...overrides });
};

exports.createTestUserAccount = async (overrides = {}) => {
    return exports.createUser({ isTestAccount: true, isEmailVerified: true, ...overrides });
};

exports.generateUserToken = (user) => {
    if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET missing in test env");
    return jwt.sign({ id: user._id.toString(), type: 'user' }, process.env.JWT_SECRET, { expiresIn: '1h' });
};

exports.createAdmin = async (overrides = {}) => {
    const defaults = {
        username: generateUnique('admin_'),
        password: 'superStrongPassword123!',
        role: 'admin',
        isActive: true,
    };
    return AdminUser.create({ ...defaults, ...overrides });
};

exports.createSuperAdmin = async (overrides = {}) => {
    return exports.createAdmin({ role: 'superadmin', ...overrides });
};

exports.createReport = async ({ reportedBy, reportedUser, reportedMessage, overrides = {} }) => {
    const defaults = {
        reportedBy: reportedBy?._id || reportedBy,
        reportedUser: reportedUser?._id || reportedUser,
        reportedMessage: reportedMessage?._id || reportedMessage,
        reportType: 'spam',
        reason: 'Default test report reason.',
        status: 'pending',
    };

    if (!defaults.reportedUser && !defaults.reportedMessage) {
        throw new Error("Report target required (user or message)");
    }
    return Report.create({ ...defaults, ...overrides });
};

exports.createChat = async (participants) => {
    if (!participants || participants.length < 2) throw new Error("Chat needs 2+ participants");
    return Chat.create({ participants: participants.map(p => p._id || p) });
};

exports.createMessage = async ({ chatId, senderId, content, overrides = {} }) => {
    return Message.create({
        chatId: chatId._id || chatId,
        senderId: senderId._id || senderId,
        content: content || generateUnique('Test msg '),
        ...overrides
    });
};

exports.createInterestCategory = async (overrides = {}) => {
    return InterestCategory.create({
        name: overrides.name || uniqueCategoryName(),
        description: 'Test category',
        ...overrides
    });
};

exports.createInterest = async (options = {}) => {
    const { category, categoryId, overrides, ...rest } = options;
    const catId = category?._id || category || categoryId;

    return Interest.create({
        name: generateUnique('Interest_'),
        description: 'Test interest',
        isArchived: false,
        category: catId,
        ...rest,
        ...overrides
    });
};

exports.addUserInterestEntry = async ({ userId, interestId, overrides = {} }) => {
    return UserInterest.create({
        userId: userId?._id || userId,
        interestId: interestId?._id || interestId,
        customDescription: 'Custom desc',
        ...overrides
    });
};

exports.createFriendship = async ({ user1, user2, requestedBy, status = 'pending', overrides = {} }) => {
    const id1 = user1._id || user1;
    const id2 = user2._id || user2;
    
    const [u1, u2] = id1.toString() < id2.toString() ? [id1, id2] : [id2, id1];
    const requester = (requestedBy?._id || requestedBy) ?? u1;

    const data = {
        user1: u1,
        user2: u2,
        requestedBy: requester,
        status,
        friendshipType: 'unverified',
        isBlocked: status === 'blocked',
        blockedBy: status === 'blocked' ? requester : null,
        ...overrides
    };

    return Friendship.findOneAndUpdate(
        { user1: u1, user2: u2 },
        { $set: data },
        { new: true, upsert: true, setDefaultsOnInsert: true }
    );
};

exports.createLanguage = async (overrides = {}) => {
    const defaults = {
        code: overrides.code || uniqueLanguageCode(),
        name: 'Test Language',
        nativeName: 'Test Native',
        isArchived: false,
    };
    return Language.create({ ...defaults, ...overrides });
};

exports.createAuditLog = async (overrides = {}) => {
    const defaults = {
        level: 'info',
        actorType: 'system',
        action: 'test_action',
        timestamp: new Date()
    };
    return AuditLog.create({ ...defaults, ...overrides });
};

// --- Cleanup Helpers ---

exports.clearDatabase = async () => {
    const collections = mongoose.connection.collections;
    await Promise.all(Object.values(collections).map(c => c.deleteMany({})));
};

exports.clearSpecificCollections = async (names = []) => {
    const collections = mongoose.connection.collections;
    const promises = names.map(name => {
        const collection = collections[name] || collections[name.toLowerCase()] || collections[name + 's'];
        return collection ? collection.deleteMany({}) : Promise.resolve();
    });
    await Promise.all(promises);
};

// Exports helper functions
exports.generateUnique = generateUnique;
exports.uniqueCategoryName = uniqueCategoryName;
exports.uniqueUsernameFactory = uniqueUsername;
exports.uniqueLanguageCode = uniqueLanguageCode;