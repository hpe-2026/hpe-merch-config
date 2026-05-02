import jwt from 'jsonwebtoken';
import bcryptjs from 'bcryptjs';
import config from '../config/index.js';
import logger from '../config/logger.js';

class AuthService {
  async hashPassword(password) {
    try {
      const hashedPassword = await bcryptjs.hash(password, 10);
      return hashedPassword;
    } catch (error) {
      logger.error('Password hashing failed', { error: error.message });
      throw error;
    }
  }

  async comparePassword(plainPassword, hashedPassword) {
    try {
      const isMatch = await bcryptjs.compare(plainPassword, hashedPassword);
      return isMatch;
    } catch (error) {
      logger.error('Password comparison failed', { error: error.message });
      throw error;
    }
  }

  generateAccessToken(userId, email, role = 'user') {
    try {
      const token = jwt.sign(
        {
          userId,
          email,
          role,
          type: 'access',
        },
        config.jwt_secret,
        { expiresIn: config.jwt_expiry }
      );
      return token;
    } catch (error) {
      logger.error('Access token generation failed', { error: error.message });
      throw error;
    }
  }

  generateRefreshToken(userId) {
    try {
      const token = jwt.sign(
        {
          userId,
          type: 'refresh',
        },
        config.jwt_secret,
        { expiresIn: '30d' }
      );
      return token;
    } catch (error) {
      logger.error('Refresh token generation failed', { error: error.message });
      throw error;
    }
  }

  verifyToken(token) {
    try {
      const decoded = jwt.verify(token, config.jwt_secret);
      return decoded;
    } catch (error) {
      logger.error('Token verification failed', { error: error.message });
      throw error;
    }
  }

  decodeToken(token) {
    try {
      const decoded = jwt.decode(token);
      return decoded;
    } catch (error) {
      logger.error('Token decode failed', { error: error.message });
      return null;
    }
  }
}

export default new AuthService();
