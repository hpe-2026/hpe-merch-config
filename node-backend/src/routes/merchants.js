import express from 'express';
import mongoose from 'mongoose';
import { authMiddleware } from '../middleware/index.js';
import logger from '../config/logger.js';
import User from '../schemas/user.js';

const router = express.Router();

/**
 * Helper to find user by various ID formats
 */
async function findUserByAuth(req) {
  const userId = req.user?.userId || req.user?.user_id || req.user?.id;
  const email = req.user?.email;

  // Try by email first (most reliable)
  if (email) {
    const user = await User.findOne({ email });
    if (user) return user;
  }

  // Try by user_id field (Keycloak UUID)
  if (userId) {
    const user = await User.findOne({ user_id: userId });
    if (user) return user;
  }

  // Try by _id (MongoDB ObjectId)
  if (userId && mongoose.Types.ObjectId.isValid(userId)) {
    const user = await User.findById(userId);
    if (user) return user;
  }

  return null;
}

/**
 * GET /api/v1/merchants/profile
 * Get the current user's profile (including profileImage)
 */
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const user = await findUserByAuth(req);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.status(200).json({
      success: true,
      data: {
        name: user.name,
        email: user.email,
        profileImage: user.profileImage || null,
        merchantName: user.merchantName || null,
        phone: user.phone || null,
        address: user.address || null,
        description: user.description || null,
        merchant_id: user.merchant_id,
      },
    });
  } catch (error) {
    logger.error('Failed to get merchant profile:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch profile' });
  }
});

/**
 * PUT /api/v1/merchants/profile
 * Update profile (name, phone, address, description, profileImage)
 */
router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const user = await findUserByAuth(req);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const { name, merchantName, phone, address, description, profileImage } = req.body;

    if (name !== undefined) user.name = name;
    if (merchantName !== undefined) user.merchantName = merchantName;
    if (phone !== undefined) user.phone = phone;
    if (address !== undefined) user.address = address;
    if (description !== undefined) user.description = description;
    if (profileImage !== undefined) user.profileImage = profileImage;

    await user.save();

    logger.info('Profile updated', { userId: user._id, email: user.email });

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        name: user.name,
        email: user.email,
        profileImage: user.profileImage || null,
        merchantName: user.merchantName || null,
        phone: user.phone || null,
        address: user.address || null,
        description: user.description || null,
        merchant_id: user.merchant_id,
      },
    });
  } catch (error) {
    logger.error('Failed to update profile:', error.message);
    res.status(500).json({ success: false, message: 'Failed to update profile' });
  }
});

export default router;
