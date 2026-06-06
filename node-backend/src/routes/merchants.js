import express from 'express';
import { authMiddleware } from '../middleware/index.js';
import logger from '../config/logger.js';
import UserVerification from '../schemas/userVerification.js';

const router = express.Router();

/**
 * GET /api/v1/merchants/profile
 * Get the current merchant's profile (including profileImage)
 */
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.user_id || req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'User ID not found' });
    }

    const user = await UserVerification.findOne({
      $or: [{ user_id: userId }, { _id: userId }],
    });

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
 * Update merchant profile (name, phone, address, description, profileImage)
 */
router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.user_id || req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'User ID not found' });
    }

    const { name, merchantName, phone, address, description, profileImage } = req.body;

    const updateFields = {};
    if (name !== undefined) updateFields.name = name;
    if (merchantName !== undefined) updateFields.merchantName = merchantName;
    if (phone !== undefined) updateFields.phone = phone;
    if (address !== undefined) updateFields.address = address;
    if (description !== undefined) updateFields.description = description;
    if (profileImage !== undefined) updateFields.profileImage = profileImage;

    const user = await UserVerification.findOneAndUpdate(
      { $or: [{ user_id: userId }, { _id: userId }] },
      updateFields,
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    logger.info('Merchant profile updated', { userId, fields: Object.keys(updateFields) });

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
    logger.error('Failed to update merchant profile:', error.message);
    res.status(500).json({ success: false, message: 'Failed to update profile' });
  }
});

export default router;
