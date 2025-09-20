require('dotenv').config({ path: '.env.test' });

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
    } catch (err) {
        console.error('[jest.setup.js] FATAL: Error connecting to in-memory test DB:', err);
        process.exit(1);
    }
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
});

beforeEach(async () => {
    jest.clearAllMocks();
});