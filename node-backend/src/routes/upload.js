import express from 'express';
import multer from 'multer';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { authMiddleware } from '../middleware/index.js';
import logger from '../config/logger.js';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';

const router = express.Router();

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept only images
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  },
});

// Configure MinIO/S3 client
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  endpoint: process.env.S3_ENDPOINT || 'http://minio:9000',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY || 'minioadmin',
    secretAccessKey: process.env.S3_SECRET_KEY || process.env.MINIO_ROOT_PASSWORD || 'minioadmin123',
  },
  forcePathStyle: true, // Required for MinIO
});

const BUCKET_NAME = process.env.S3_BUCKET_NAME || 'nitte-users';

/**
 * Upload profile image
 * POST /api/upload/profile-image
 */
router.post(
  '/profile-image',
  authMiddleware,
  upload.single('file'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No file uploaded',
        });
      }

      const userId = req.user?.userId || req.user?.id;
      const merchantId = req.body?.merchantId || req.user?.merchantId;
      const uploadType = req.body?.type || 'profile';

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'User ID not found',
        });
      }

      // Generate unique filename
      const fileExtension = path.extname(req.file.originalname);
      const timestamp = Date.now();
      const randomId = uuidv4().split('-')[0];
      const key = `profiles/${uploadType}/${userId}/${timestamp}-${randomId}${fileExtension}`;

      // Upload to MinIO
      const uploadParams = {
        Bucket: BUCKET_NAME,
        Key: key,
        Body: req.file.buffer,
        ContentType: req.file.mimetype,
        Metadata: {
          'user-id': userId,
          'merchant-id': merchantId || '',
          'upload-type': uploadType,
          'original-name': req.file.originalname,
        },
      };

      await s3Client.send(new PutObjectCommand(uploadParams));

      // Construct URL
      const endpoint = process.env.S3_PUBLIC_ENDPOINT || process.env.S3_ENDPOINT || 'http://localhost:9000';
      const fileUrl = `${endpoint}/${BUCKET_NAME}/${key}`;

      logger.info('Profile image uploaded', {
        userId,
        merchantId,
        key,
        size: req.file.size,
        type: req.file.mimetype,
      });

      res.status(200).json({
        success: true,
        message: 'Image uploaded successfully',
        url: fileUrl,
        key,
        size: req.file.size,
      });
    } catch (error) {
      logger.error('Failed to upload profile image:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to upload image',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }
);

/**
 * Delete profile image
 * DELETE /api/upload/profile-image
 */
router.delete(
  '/profile-image',
  authMiddleware,
  async (req, res) => {
    try {
      const { key } = req.body;
      const userId = req.user?.userId || req.user?.id;

      if (!key) {
        return res.status(400).json({
          success: false,
          message: 'Image key is required',
        });
      }

      // Verify the key belongs to the user (security check)
      if (!key.includes(`/profiles/`) || !key.includes(`/${userId}/`)) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to delete this image',
        });
      }

      await s3Client.send(new DeleteObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
      }));

      logger.info('Profile image deleted', { userId, key });

      res.status(200).json({
        success: true,
        message: 'Image deleted successfully',
      });
    } catch (error) {
      logger.error('Failed to delete profile image:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete image',
      });
    }
  }
);

/**
 * Get upload URL for direct browser upload (presigned URL)
 * POST /api/upload/presigned-url
 */
router.post(
  '/presigned-url',
  authMiddleware,
  async (req, res) => {
    try {
      const { filename, contentType } = req.body;
      const userId = req.user?.userId || req.user?.id;

      if (!filename || !contentType) {
        return res.status(400).json({
          success: false,
          message: 'Filename and contentType are required',
        });
      }

      const fileExtension = path.extname(filename);
      const timestamp = Date.now();
      const randomId = uuidv4().split('-')[0];
      const key = `profiles/temp/${userId}/${timestamp}-${randomId}${fileExtension}`;

      // Note: For presigned URLs, you'd typically use @aws-sdk/s3-presigned-post
      // This is a simplified version
      const url = `${process.env.S3_ENDPOINT || 'http://minio:9000'}/${BUCKET_NAME}/${key}`;

      res.status(200).json({
        success: true,
        url,
        key,
        fields: {
          bucket: BUCKET_NAME,
          key,
        },
      });
    } catch (error) {
      logger.error('Failed to generate presigned URL:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate upload URL',
      });
    }
  }
);

/**
 * Upload product image
 * POST /api/upload/product-image
 */
router.post(
  '/product-image',
  authMiddleware,
  upload.single('file'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No file uploaded',
        });
      }

      const userId = req.user?.userId || req.user?.id;
      const merchantId = req.body?.merchantId || req.user?.merchantId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'User ID not found',
        });
      }

      // Use products bucket
      const productsBucket = process.env.S3_PRODUCTS_BUCKET || 'nitte-products';

      // Generate unique filename
      const fileExtension = path.extname(req.file.originalname);
      const timestamp = Date.now();
      const randomId = uuidv4().split('-')[0];
      const key = `products/${merchantId || userId}/${timestamp}-${randomId}${fileExtension}`;

      // Upload to MinIO
      const uploadParams = {
        Bucket: productsBucket,
        Key: key,
        Body: req.file.buffer,
        ContentType: req.file.mimetype,
        Metadata: {
          'user-id': userId,
          'merchant-id': merchantId || '',
          'upload-type': 'product-image',
          'original-name': req.file.originalname,
        },
      };

      await s3Client.send(new PutObjectCommand(uploadParams));

      // Construct URL
      const endpoint = process.env.S3_PUBLIC_ENDPOINT || process.env.S3_ENDPOINT || 'http://localhost:9000';
      const fileUrl = `${endpoint}/${productsBucket}/${key}`;

      logger.info('Product image uploaded', {
        userId,
        merchantId,
        key,
        size: req.file.size,
        type: req.file.mimetype,
      });

      res.status(200).json({
        success: true,
        message: 'Product image uploaded successfully',
        url: fileUrl,
        key,
        size: req.file.size,
      });
    } catch (error) {
      logger.error('Failed to upload product image:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to upload image',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }
);

export default router;
