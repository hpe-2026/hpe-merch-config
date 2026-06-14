import express from 'express';
import multer from 'multer';
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { authMiddleware } from '../middleware/index.js';
import logger from '../config/logger.js';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import config from '../config/index.js';
import User from '../schemas/user.js';

/**
 * Transform MinIO image URLs to backend proxy URLs (avoids CORS issues)
 */
const transformImageUrl = (url) => {
  if (!url) return null;
  if (url.includes('/api/v1/upload/images/')) return url;
  const minioPattern = /http:\/\/[^:]+:9000\/(.*)/;
  const match = url.match(minioPattern);
  if (match) {
    return `${config.api_base_url || ''}/api/v1/upload/images/${match[1]}`;
  }
  return url;
};

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

      const imageUrl = transformImageUrl(fileUrl);

      // Persist profileImage URL to user record in DB
      try {
        // Find user by various ID formats
        let userRecord = null;
        const userEmail = req.user?.email;
        
        if (userEmail) {
          userRecord = await User.findOne({ email: userEmail });
        }
        if (!userRecord && userId) {
          userRecord = await User.findOne({ user_id: userId });
        }
        if (!userRecord && userId && userId.match(/^[0-9a-fA-F]{24}$/)) {
          userRecord = await User.findById(userId);
        }
        if (!userRecord && merchantId) {
          userRecord = await User.findOne({ merchant_id: merchantId });
        }

        if (userRecord) {
          userRecord.profileImage = imageUrl;
          await userRecord.save();
          logger.info('Profile image URL saved to DB', { userId, imageUrl });
        } else {
          logger.warn('Could not find user record to persist profileImage', { userId, merchantId });
        }
      } catch (dbErr) {
        logger.warn('Failed to persist profileImage to DB (image still uploaded):', dbErr.message);
      }

      res.status(200).json({
        success: true,
        message: 'Image uploaded successfully',
        url: imageUrl,
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
        url: transformImageUrl(fileUrl),
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

/**
 * GET /api/v1/upload/images/:key
 * Proxy endpoint to serve MinIO images (avoids CORS issues)
 */
router.options('/images/*', (req, res) => {
  // Handle preflight requests
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.set('Access-Control-Allow-Headers', '*');
  res.set('Cross-Origin-Resource-Policy', 'cross-origin');
  res.status(204).send();
});

router.get('/images/*', async (req, res) => {
  try {
    let imageKey = req.params[0];
    
    if (!imageKey) {
      return res.status(400).json({ success: false, message: 'Image key required' });
    }

    // Detect bucket from URL path - first segment is the bucket name
    // URL format: /api/v1/upload/images/bucket-name/path/to/file
    let bucket = process.env.S3_PRODUCTS_BUCKET || 'nitte-products';
    const pathParts = imageKey.split('/');
    const possibleBucket = pathParts[0];
    
    // Check if first segment is a known bucket
    const knownBuckets = [
      process.env.S3_PRODUCTS_BUCKET,
      process.env.S3_BUCKET_NAME,
      'nitte-products',
      'nitte-users'
    ].filter(Boolean);
    
    if (knownBuckets.includes(possibleBucket)) {
      bucket = possibleBucket;
      imageKey = pathParts.slice(1).join('/');
    }

    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: imageKey,
    });

    const response = await s3Client.send(command);

    // Determine content type - ALWAYS sniff content (MinIO may have wrong content type)
    const getContentType = async (stream, key) => {
      // Sniff first few bytes to detect actual file type
      const chunks = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
        if (Buffer.concat(chunks).length >= 100) break;
      }
      const header = Buffer.concat(chunks).toString('utf8', 0, 100).trim().toLowerCase();
      
      // Check for SVG signature
      if (header.includes('<?xml') || header.includes('<svg')) {
        return 'image/svg+xml';
      }
      // Check for PNG signature
      if (header.startsWith('\x89PNG')) {
        return 'image/png';
      }
      // Check for JPEG
      if (header.startsWith('\xff\xd8')) {
        return 'image/jpeg';
      }
      
      // Fallback to extension-based detection
      const ext = key.split('.').pop()?.toLowerCase();
      const mimeTypes = {
        'svg': 'image/svg+xml',
        'png': 'image/png',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'gif': 'image/gif',
        'webp': 'image/webp',
      };
      return mimeTypes[ext] || 'application/octet-stream';
    };

    // Get the stream and determine content type (consumes first part of stream)
    const originalStream = response.Body;
    const contentType = await getContentType(originalStream, imageKey);
    res.set('Content-Type', contentType);
    
    // Set CORS and CORP headers
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.set('Access-Control-Allow-Headers', '*');
    res.set('Timing-Allow-Origin', '*');
    
    // Cache headers
    res.set('Cache-Control', 'public, max-age=86400');

    // Stream the image data (originalStream was partially consumed by getContentType)
    // We need to refetch since the stream was consumed
    const freshCommand = new GetObjectCommand({
      Bucket: bucket,
      Key: imageKey,
    });
    const freshResponse = await s3Client.send(freshCommand);
    const stream = freshResponse.Body;
    stream.pipe(res);

    stream.on('error', (error) => {
      logger.error('Error streaming image:', error);
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: 'Failed to stream image' });
      }
    });
  } catch (error) {
    logger.error('Failed to retrieve image:', error.message);
    res.status(404).json({ success: false, message: 'Image not found' });
  }
});

export default router;
