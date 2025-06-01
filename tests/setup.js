// tests/setup.js
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongod; // Zmienna przechowująca instancję serwera MongoDB w pamięci

// Uruchamiane raz przed wszystkimi testami w danym pliku/suicie
beforeAll(async () => {
    mongod = await MongoMemoryServer.create(); // Stwórz instancję serwera
    const uri = mongod.getUri(); // Pobierz URI do połączenia

    // Ustaw URI bazy danych dla testów (ważne, aby było inne niż produkcyjne/deweloperskie)
    process.env.MONGO_URI_TEST = uri; // Użyjemy tej zmiennej w testach do połączenia

    // Opcjonalnie: połącz się globalnie, jeśli wszystkie testy używają tego samego połączenia
    // await mongoose.connect(uri, {
    //     useNewUrlParser: true,
    //     useUnifiedTopology: true,
    // });
});

// Uruchamiane raz po wszystkich testach w danym pliku/suicie
afterAll(async () => {
    if (mongoose.connection.readyState !== 0) { // Sprawdź czy jest aktywne połączenie
         await mongoose.disconnect(); // Rozłącz mongoose
    }
    if (mongod) {
        await mongod.stop(); // Zatrzymaj serwer MongoDB w pamięci
    }
});

async function clearDatabase() {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
        await collections[key].deleteMany({});
    }
}

beforeEach(async () => {
    if (mongoose.connection.readyState === 0) return; // baza jeszcze nie podłączona
    await clearDatabase();
});

// Możesz wyeksportować funkcje pomocnicze, jeśli są potrzebne w testach
// module.exports = { clearDatabase };