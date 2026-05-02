import mongoose from 'mongoose';
import logger from './logger.js';
import config from './index.js';

export const connectDatabase = async () => {
  try {
    await mongoose.connect(config.mongodb_url, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    logger.info('MongoDB connected successfully');
  } catch (error) {
    logger.error('MongoDB connection failed:', error);
    process.exit(1);
  }
};

export const disconnectDatabase = async () => {
  try {
    await mongoose.disconnect();
    logger.info('MongoDB disconnected');
  } catch (error) {
    logger.error('MongoDB disconnection failed:', error);
  }
};

export default mongoose;
