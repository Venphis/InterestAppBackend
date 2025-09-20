const mongoose = require('mongoose');

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

    await mongoose.connect(mongoURI);

  } catch (err) {
    console.error('MongoDB Connection Error in config/db.js:', err.message);
    if (process.env.NODE_ENV === 'test') {
        throw err;
    } else {
        process.exit(1);
    }
  }
};

module.exports = connectDB;