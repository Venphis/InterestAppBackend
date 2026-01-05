const mongoose = require('mongoose');

// Establishes connection to MongoDB based on current environment
const connectDB = async () => {
  try {
    const mongoURI = process.env.NODE_ENV === 'test' 
      ? process.env.MONGO_URI_TEST 
      : process.env.MONGO_URI;

    if (!mongoURI) {
      throw new Error('MongoDB URI not defined in .env');
    }

    const conn = await mongoose.connect(mongoURI);

    if (process.env.NODE_ENV !== 'test') {
      console.log(`MongoDB Connected: ${conn.connection.host}`);
    }

  } catch (err) {
    console.error(`MongoDB Connection Error: ${err.message}`);
    
    // Throw error in tests to fail assertions, exit process in production to restart container
    if (process.env.NODE_ENV === 'test') {
        throw err;
    } else {
        process.exit(1);
    }
  }
};

module.exports = connectDB;