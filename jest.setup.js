// jest.setup.js (w głównym folderze projektu)
require('dotenv').config({ path: '.env.test' });
// console.log('[jest.setup.js] JWT_SECRET:', process.env.JWT_SECRET);
// console.log('[jest.setup.js] JWT_ADMIN_SECRET:', process.env.JWT_ADMIN_SECRET);

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

jest.mock('./utils/sendEmail', () => jest.fn().mockResolvedValue(true));

let mongod;

beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();
    process.env.MONGO_URI_TEST = uri;
    try {
        await mongoose.connect(uri);
        // console.log('[jest.setup.js] MongoDB Memory Server Connected. Mongoose readyState:', mongoose.connection.readyState);
    } catch (err) {
        console.error('[jest.setup.js] FATAL: Error connecting to in-memory test DB:', err);
        process.exit(1);
    }
});

afterAll(async () => {
    // console.log('[jest.setup.js] afterAll: Disconnecting Mongoose...');
    await mongoose.disconnect();
    // console.log('[jest.setup.js] afterAll: Stopping mongod...');
    await mongod.stop();
    // console.log('[jest.setup.js] afterAll: MongoDB Memory Server stopped.');
});

// ZMIANA TUTAJ: Tylko czyszczenie mocków globalnie
beforeEach(async () => {
    jest.clearAllMocks(); // Wyczyść wszystkie mocki Jesta
});