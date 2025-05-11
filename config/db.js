// config/db.js
const mongoose = require('mongoose');
// require('dotenv').config(); // Lepiej załadować dotenv w głównym pliku server.js

const connectDB = async () => {
  try {
    let mongoURI;
    if (process.env.NODE_ENV === 'test') {
      mongoURI = process.env.MONGO_URI_TEST;
    } else {
      mongoURI = process.env.MONGO_URI;
    }

    if (!mongoURI) {
      throw new Error('MongoDB URI not defined. Ensure MONGO_URI or MONGO_URI_TEST (for tests) is set in your environment variables.');
    }

    // Usuń przestarzałe opcje, Mongoose 6+ ich nie potrzebuje i mogą powodować warningi
    await mongoose.connect(mongoURI /*, {
      // useNewUrlParser: true, // Przestarzałe
      // useUnifiedTopology: true, // Przestarzałe
    } */);

    // Nie loguj "MongoDB Connected..." podczas testów
    // if (process.env.NODE_ENV !== 'test') {
    // }
  } catch (err) {
    console.error('MongoDB Connection Error in config/db.js:', err.message);
    if (process.env.NODE_ENV === 'test') {
        throw err; // Pozwól Jestowi obsłużyć błąd i zakończyć testy jako FAILED
    } else {
        process.exit(1); // W innych środowiskach zakończ proces
    }
  }
};

module.exports = connectDB;