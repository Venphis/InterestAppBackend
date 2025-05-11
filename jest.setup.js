// jest.setup.js (w głównym folderze projektu)
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

// Mockuj sendEmail globalnie
jest.mock('./utils/sendEmail', () => {
    return {
        __esModule: true,
        default: jest.fn().mockResolvedValue(true),
    };
});
// NIE POTRZEBUJESZ: const sendEmail = require('./utils/sendEmail'); tutaj

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
    const collections = mongoose.connection.collections;
    for (const key in collections) {
        const collection = collections[key];
        await collection.deleteMany({});
    }
    // Wyczyść wszystkie mocki Jesta. To obejmie również mock sendEmail.
    jest.clearAllMocks();
    // LUB, jeśli chcesz być bardziej specyficzny i masz referencję do mocka:
    // const sendEmailMock = require('./utils/sendEmail'); // Ten require pobierze mocka
    // if (sendEmailMock && sendEmailMock.mockClear) {
    //     sendEmailMock.mockClear();
    // }
});