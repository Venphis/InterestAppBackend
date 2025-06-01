// tests/helpers/factories.js
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const crypto = require('crypto'); // Dodajemy crypto do generowania bardziej unikalnych nazw
const User = require('../../models/User');
const AdminUser = require('../../models/AdminUser');
const Report = require('../../models/Report');
const Message = require('../../models/Message');
const Chat = require('../../models/Chat');
const Interest = require('../../models/Interest');
const InterestCategory = require('../../models/InterestCategory');
const UserInterest = require('../../models/UserInterest');
const Friendship = require('../../models/Friendship');

// Generator unikalnych stringów (bardziej rozbudowany)
const generateUnique = (prefix = '') => `${prefix}${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
exports.generateUnique = generateUnique;

// Funkcja do generowania unikalnych nazw kategorii (zgodnie z O3)
function uniqueCategoryName() {
  return `cat_${crypto.randomBytes(6).toString('hex')}`;
}
exports.uniqueCategoryName = uniqueCategoryName;
global.uniqueCategoryName = uniqueCategoryName;

// Funkcja do generowania unikalnych nazw użytkowników (zgodnie z O3)
let userCounterForFactory = 0; // Licznik, aby zapewnić unikalność nawet przy tym samym Date.now()
function uniqueUsernameFactory(base = 'user') {
  userCounterForFactory += 1;
  return `${base}_${Date.now()}_${userCounterForFactory}`;
}
exports.uniqueUsernameFactory = uniqueUsernameFactory; // Eksportujemy na wszelki wypadek

// --- Użytkownicy (User) ---
exports.createUser = async (overrides = {}) => {
    const defaults = {
        // POPRAWKA O3 (pkt 4b) - Użyj generatora, jeśli nie podano
        username: overrides.username || uniqueUsernameFactory('user'),
        email: overrides.email || `${uniqueUsernameFactory('email')}@example.com`,
        password: 'password123',
        isEmailVerified: false,
        isBanned: false,
        isDeleted: false,
        isTestAccount: false,
    };
    const finalData = { ...defaults, ...overrides };
    // Usuń jawnie username i email z overrides, jeśli były tam, aby nie próbować ich ustawiać dwa razy
    delete finalData.username;
    delete finalData.email;

    const dataToCreate = {...defaults};
    if(overrides.username) dataToCreate.username = overrides.username;
    if(overrides.email) dataToCreate.email = overrides.email;
    if(overrides.password) dataToCreate.password = overrides.password; // Pozwól na nadpisanie hasła
    // Połącz pozostałe overrides
    Object.assign(dataToCreate, overrides);


    try {
        return await User.create(dataToCreate);
    } catch (err) {
    if (err.code === 11000 && (err.keyPattern?.username || err.keyPattern?.email)) {
        // ↓ zamiast wyrzucać wyjątek – oddaj istniejący rekord
        return await User.findOne({ username: dataToCreate.username });
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
    if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET is not defined for user token generation");
    return jwt.sign({ id: user._id.toString(), type: 'user' }, process.env.JWT_SECRET, { expiresIn: '1h' });
};

// --- Administratorzy (AdminUser) ---
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

// --- Zgłoszenia (Report) ---
exports.createReport = async ({ reportedBy, reportedUser, reportedMessage, overrides = {} }) => {
    const defaults = {
        reportedBy: reportedBy._id || reportedBy,
        reportType: 'spam',
        reason: 'Default test report reason.',
        status: 'pending',
    };
    if (reportedUser) defaults.reportedUser = reportedUser._id || reportedUser;
    if (reportedMessage) defaults.reportedMessage = reportedMessage._id || reportedMessage;

    if (!defaults.reportedUser && !defaults.reportedMessage) {
        throw new Error("Report must have either reportedUser or reportedMessage");
    }
    return Report.create({ ...defaults, ...overrides });
};

// --- Czat i Wiadomości ---
exports.createChat = async (participantsArray) => {
    if (!participantsArray || participantsArray.length < 2) {
        throw new Error("Chat requires at least two participants");
    }
    return Chat.create({ participants: participantsArray.map(p => p._id || p) });
};

exports.createMessage = async ({ chatId, senderId, content, overrides = {} }) => {
    const defaults = {
        chatId: chatId._id || chatId,
        senderId: senderId._id || senderId,
        content: content || generateUnique('Test message content '),
    };
    return Message.create({ ...defaults, ...overrides });
};

exports.createInterestCategory = async (overrides = {}) => {
    const defaults = {
        name: overrides.name || uniqueCategoryName(), // Użyj nowej funkcji
        description: 'Default category description.'
    };
    return InterestCategory.create({ ...defaults, ...overrides });
};


exports.createInterest = async (options = {}) => {
    const { category, overrides, ...rest } = options;
    const defaults = {
        name: generateUnique('Interest_'),
        description: 'Default interest description.',
        isArchived: false,
    };
    const interestData = { ...defaults, ...rest, ...(overrides || {}) };
    if (category) {
        interestData.category = category._id || category;
    } else if (options.categoryId) { // Obsługa, jeśli ktoś przekaże categoryId bezpośrednio
        interestData.category = options.categoryId;
    }
    return Interest.create(interestData);
};

exports.addUserInterestEntry = async ({ userId, interestId, overrides = {} }) => {
    const defaults = {
        userId: userId._id || userId,
        interestId: interestId._id || interestId,
        customDescription: generateUnique('Custom desc ')
    };
    return UserInterest.create({ ...defaults, ...overrides });
};

// --- Znajomości ---
exports.createFriendship = async ({ user1, user2, requestedBy, status = 'pending', overrides = {} }) => {
    const order = (a, b) => (a.toString() < b.toString() ? [a, b] : [b, a]);
    const [u1_id, u2_id] = order(user1._id || user1, user2._id || user2);
    const requestedBy_id = (requestedBy?._id || requestedBy) ?? u1_id;

    // POPRAWKA O3 (pkt 3.3) - Jeśli już istnieje, zwróć go lub zaktualizuj (ostrożnie z aktualizacją tutaj)
    let friendship = await Friendship.findOne({ user1: u1_id, user2: u2_id });

    const dataToSet = {
        requestedBy: requestedBy_id,
        status,
        friendshipType: overrides.friendshipType || 'unverified',
        // POPRAWKA O3 (pkt 2 dla fabryki)
        isBlocked: status === 'blocked' || overrides.isBlocked === true,
        blockedBy: status === 'blocked'
            ? (overrides.blockedBy || requestedBy_id) // Kto blokuje, jeśli status to blocked
            : (overrides.isBlocked === true ? (overrides.blockedBy || requestedBy_id) : null), // Kto blokuje, jeśli tylko isBlocked
        ...overrides
    };

    if (friendship) {
        // Aktualizuj istniejącą, ale tylko pola, które mają sens (np. status, blockedBy, isBlocked)
        // Unikaj nadpisywania user1, user2, requestedBy, jeśli relacja już istnieje.
        friendship.status = dataToSet.status;
        if (
            dataToSet.friendshipType === 'verified' ||
            friendship.friendshipType !== 'verified'
            ) {
            friendship.friendshipType = dataToSet.friendshipType;
        }
        friendship.isBlocked = dataToSet.isBlocked;
        friendship.blockedBy = dataToSet.blockedBy;
        // Możesz dodać inne pola z dataToSet, które mogą być aktualizowane
        return friendship.save();
    } else {
        // Stwórz nową
        const defaultsForCreation = {
            user1: u1_id,
            user2: u2_id,
        };
        return Friendship.create({ ...defaultsForCreation, ...dataToSet });
    }
};

// --- Ogólne Helpery Bazy Danych ---
/**
 * Usuwa wszystkie dokumenty ze wszystkich kolekcji w bieżącej bazie danych.
 * Ostrożnie z tą funkcją!
 */
exports.clearDatabase = async () => {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
        const collection = collections[key];
        await collection.deleteMany({});
    }
};

/**
 * Usuwa wszystkie dokumenty z podanych kolekcji.
 * @param {string[]} collectionNames - Tablica nazw kolekcji do wyczyszczenia (np. ['users', 'adminusers'])
 */
exports.clearSpecificCollections = async (collectionNames = []) => {
    if (!Array.isArray(collectionNames)) {
        return;
    }
    const collections = mongoose.connection.collections;
    for (const name of collectionNames) {
        // Nazwy kolekcji w Mongoose są zazwyczaj w liczbie mnogiej i małymi literami
        const collectionKey = name.toLowerCase() + (name.endsWith('s') ? '' : 's'); // Prosta heurystyka
        if (collections[collectionKey]) {
            await collections[collectionKey].deleteMany({});
        } else if (collections[name.toLowerCase()]) { // Spróbuj też bez 's'
            await collections[name.toLowerCase()].deleteMany({});
        } else {
            console.warn(`Collection "${name}" (or "${collectionKey}") not found for clearing.`);
        }
    }
};