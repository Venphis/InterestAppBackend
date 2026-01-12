const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongod;

// Start In-Memory DB before all tests
beforeAll(async () => {
    mongod = await MongoMemoryServer.create(); 
    process.env.MONGO_URI_TEST = mongod.getUri();
});

// Cleanup after all tests
afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
         await mongoose.disconnect(); 
    }
    if (mongod) {
        await mongod.stop();
    }
});

// Helper: Clear all collections
async function clearDatabase() {
    if (mongoose.connection.readyState === 0) return;
    
    const collections = mongoose.connection.collections;
    const promises = Object.values(collections).map(collection => collection.deleteMany({}));
    await Promise.all(promises);
}

// Reset DB state before each test
beforeEach(async () => {
    await clearDatabase();
});