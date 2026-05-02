// Auth Service Tests
import authService from '../services/authService';
import jwtModule from 'jsonwebtoken';

describe('AuthService', () => {
  describe('Password Hashing', () => {
    it('should hash password successfully', async () => {
      const password = 'testPassword123';
      const hashedPassword = await authService.hashPassword(password);

      expect(hashedPassword).not.toBe(password);
      expect(hashedPassword.length).toBeGreaterThan(0);
    });

    it('should compare passwords correctly', async () => {
      const password = 'testPassword123';
      const hashedPassword = await authService.hashPassword(password);
      const isMatch = await authService.comparePassword(password, hashedPassword);

      expect(isMatch).toBe(true);
    });

    it('should reject incorrect password', async () => {
      const password = 'testPassword123';
      const hashedPassword = await authService.hashPassword(password);
      const isMatch = await authService.comparePassword('wrongPassword', hashedPassword);

      expect(isMatch).toBe(false);
    });
  });

  describe('JWT Token Generation', () => {
    it('should generate valid access token', () => {
      const token = authService.generateAccessToken('user123', 'user@example.com', 'user');

      expect(token).toBeTruthy();
      expect(typeof token).toBe('string');
      expect(token.split('.').length).toBe(3); // JWT has 3 parts
    });

    it('should generate refresh token', () => {
      const token = authService.generateRefreshToken('user123');

      expect(token).toBeTruthy();
      expect(typeof token).toBe('string');
    });

    it('should decode token correctly', () => {
      const token = authService.generateAccessToken('user123', 'user@example.com', 'user');
      const decoded = authService.decodeToken(token);

      expect(decoded.userId).toBe('user123');
      expect(decoded.email).toBe('user@example.com');
      expect(decoded.role).toBe('user');
    });

    it('should verify valid token', () => {
      const token = authService.generateAccessToken('user123', 'user@example.com', 'user');
      const verified = authService.verifyToken(token);

      expect(verified.userId).toBe('user123');
    });

    it('should reject invalid token', () => {
      const invalidToken = 'invalid.token.here';

      expect(() => {
        authService.verifyToken(invalidToken);
      }).toThrow();
    });
  });
});
