const mongoose = require('mongoose');
const logger = require('../utils/logger');

class Database {
  constructor() {
    this.isConnected = false;
  }

  async connect() {
    try {
      await mongoose.connect(process.env.MONGODB_URL, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      });
      
      this.isConnected = true;
      logger.info('✅ Connected to MongoDB');
    } catch (error) {
      logger.error('❌ MongoDB connection failed:', error.message);
      throw error;
    }
  }

  async disconnect() {
    try {
      await mongoose.disconnect();
      this.isConnected = false;
      logger.info('✅ Disconnected from MongoDB');
    } catch (error) {
      logger.error('❌ MongoDB disconnection failed:', error.message);
      throw error;
    }
  }

  getConnectionStatus() {
    return this.isConnected;
  }
}

module.exports = new Database(); 