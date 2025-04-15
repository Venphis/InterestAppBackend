// config/db.js
const mongoose = require('mongoose');
require('dotenv').config(); // Upewnij się, że zmienne środowiskowe są załadowane

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      // useCreateIndex: true, // Te opcje mogą być przestarzałe w nowszych wersjach Mongoose
      // useFindAndModify: false,
    });
    console.log('MongoDB Connected...');
  } catch (err) {
    console.error('MongoDB Connection Error:', err.message);
    // Zakończ proces z błędem
    process.exit(1);
  }
};

module.exports = connectDB;