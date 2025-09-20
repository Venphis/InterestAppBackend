const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongod;

beforeAll(async () => {
    mongod = await MongoMemoryServer.create(); 
    const uri = mongod.getUri(); 

    process.env.MONGO_URI_TEST = uri;

});

afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
         await mongoose.disconnect(); 
    }
    if (mongod) {
        await mongod.stop();
    }
});

async function clearDatabase() {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
        await collections[key].deleteMany({});
    }
}

beforeEach(async () => {
    if (mongoose.connection.readyState === 0) return; 
    await clearDatabase();
});
