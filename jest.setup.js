// Global Jest config: sets up in-memory MongoDB for isolated testing
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const path = require('path');

require('dotenv').config({ path: '.env.test' });

// Mock email service to prevent network calls during tests
jest.mock('./utils/sendEmail', () => jest.fn().mockResolvedValue(true));

let mongod;

// Start in-memory MongoDB instance and connect Mongoose before tests run
beforeAll(async () => {
    try {
        mongod = await MongoMemoryServer.create();
        const uri = mongod.getUri();
        process.env.MONGO_URI_TEST = uri;
        await mongoose.connect(uri);
    } catch (err) {
        console.error('FATAL: Failed to start in-memory DB:', err);
        throw err;
    }
});

// Cleanup: disconnect Mongoose and stop the in-memory server
afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
    }
    if (mongod) {
        await mongod.stop();
    }
});

// Reset mocks between tests to ensure isolation
beforeEach(() => {
    jest.clearAllMocks();
});