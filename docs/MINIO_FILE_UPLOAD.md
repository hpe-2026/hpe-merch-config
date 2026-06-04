# MinIO File Upload Guide

This guide shows how to implement file uploads in your backend using MinIO as S3-compatible storage.

---

## Backend Implementation (Node.js)

### 1. Install Dependencies

```bash
cd node-backend
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner multer
```

### 2. Configure S3 Client (MinIO)

```javascript
// config/minio.js
const { S3Client } = require('@aws-sdk/client-s3');

const s3Client = new S3Client({
  endpoint: process.env.MINIO_ENDPOINT || 'http://minio:9000',
  region: 'us-east-1',  // MinIO doesn't use regions, but SDK requires it
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY || 'minioadmin',
    secretAccessKey: process.env.MINIO_SECRET_KEY || 'minioadmin123',
  },
  forcePathStyle: true,  // Required for MinIO (not virtual-hosted style)
});

const BUCKETS = {
  PRODUCTS: 'nitte-products',
  USERS: 'nitte-users',
  BACKUPS: 'nitte-backups',
};

module.exports = { s3Client, BUCKETS };
```

### 3. Upload Service

```javascript
// services/uploadService.js
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { s3Client, BUCKETS } = require('../config/minio');

class UploadService {
  /**
   * Upload file buffer to MinIO
   * @param {Buffer} fileBuffer - File data
   * @param {string} bucket - Target bucket
   * @param {string} key - Object key (path/filename)
   * @param {string} contentType - MIME type
   * @returns {Promise<string>} Object URL
   */
  async uploadFile(fileBuffer, bucket, key, contentType) {
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: fileBuffer,
      ContentType: contentType,
    });

    await s3Client.send(command);
    return `${process.env.MINIO_PUBLIC_URL || 'http://localhost:9000'}/${bucket}/${key}`;
  }

  /**
   * Generate pre-signed URL for file access
   * @param {string} bucket - Bucket name
   * @param {string} key - Object key
   * @param {number} expiresIn - URL expiry in seconds (default: 3600)
   * @returns {Promise<string>} Pre-signed URL
   */
  async getSignedUrl(bucket, key, expiresIn = 3600) {
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    return await getSignedUrl(s3Client, command, { expiresIn });
  }

  /**
   * Upload product image
   * @param {Buffer} fileBuffer - Image data
   * @param {string} productId - Product identifier
   * @param {string} filename - Original filename
   * @returns {Promise<string>} Image URL
   */
  async uploadProductImage(fileBuffer, productId, filename) {
    const key = `products/${productId}/${Date.now()}-${filename}`;
    return await this.uploadFile(
      fileBuffer,
      BUCKETS.PRODUCTS,
      key,
      'image/jpeg'  // Adjust based on file type
    );
  }

  /**
   * Upload user avatar
   * @param {Buffer} fileBuffer - Image data
   * @param {string} userId - User identifier
   * @param {string} filename - Original filename
   * @returns {Promise<string>} Avatar URL
   */
  async uploadUserAvatar(fileBuffer, userId, filename) {
    const key = `avatars/${userId}/${Date.now()}-${filename}`;
    return await this.uploadFile(
      fileBuffer,
      BUCKETS.USERS,
      key,
      'image/jpeg'
    );
  }
}

module.exports = new UploadService();
```

### 4. Express Route Handler

```javascript
// routes/upload.js
const express = require('express');
const multer = require('multer');
const uploadService = require('../services/uploadService');
const { authenticateJWT } = require('../middleware/auth');

const router = express.Router();
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },  // 5MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only images allowed'), false);
    }
  }
});

// Upload product image (admin/merchant only)
router.post(
  '/products/:productId/images',
  authenticateJWT,
  upload.single('image'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No image provided' });
      }

      const { productId } = req.params;
      const imageUrl = await uploadService.uploadProductImage(
        req.file.buffer,
        productId,
        req.file.originalname
      );

      res.json({
        success: true,
        url: imageUrl,
        productId,
      });
    } catch (error) {
      console.error('Product image upload failed:', error);
      res.status(500).json({ error: 'Upload failed' });
    }
  }
);

// Upload user avatar
router.post(
  '/users/avatar',
  authenticateJWT,
  upload.single('avatar'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No avatar provided' });
      }

      const userId = req.user.id;  // From JWT
      const avatarUrl = await uploadService.uploadUserAvatar(
        req.file.buffer,
        userId,
        req.file.originalname
      );

      // Update user record with new avatar URL
      // await User.findByIdAndUpdate(userId, { avatarUrl });

      res.json({
        success: true,
        url: avatarUrl,
      });
    } catch (error) {
      console.error('Avatar upload failed:', error);
      res.status(500).json({ error: 'Upload failed' });
    }
  }
);

// Get pre-signed URL for private file access
router.get('/signed-url', authenticateJWT, async (req, res) => {
  try {
    const { bucket, key } = req.query;
    if (!bucket || !key) {
      return res.status(400).json({ error: 'bucket and key required' });
    }

    const signedUrl = await uploadService.getSignedUrl(bucket, key, 300);  // 5 min expiry
    res.json({ url: signedUrl });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate URL' });
  }
});

module.exports = router;
```

### 5. Environment Variables

Add to `node-backend/.env`:

```bash
# MinIO Configuration
MINIO_ENDPOINT=http://minio:9000
MINIO_PUBLIC_URL=http://localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin123
```

And update `docker-compose.yml` for backend service:

```yaml
  backend:
    environment:
      - MINIO_ENDPOINT=http://minio:9000
      - MINIO_PUBLIC_URL=http://localhost:9000
      - MINIO_ACCESS_KEY=minioadmin
      - MINIO_SECRET_KEY=${MINIO_ROOT_PASSWORD:-minioadmin123}
```

---

## Frontend Implementation (React Example)

```javascript
// components/ImageUpload.jsx
import React, { useState } from 'react';

function ImageUpload({ productId, onUpload }) {
  const [uploading, setUploading] = useState(false);

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('image', file);

    setUploading(true);
    try {
      const response = await fetch(
        `http://localhost:3000/api/upload/products/${productId}/images`,
        {
          method: 'POST',
          body: formData,
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
          },
        }
      );

      const data = await response.json();
      if (data.success) {
        onUpload(data.url);
      }
    } catch (error) {
      console.error('Upload failed:', error);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <input
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        disabled={uploading}
      />
      {uploading && <span>Uploading...</span>}
    </div>
  );
}

export default ImageUpload;
```

---

## Testing File Uploads

### Using curl

```bash
# Upload a product image
curl -X POST \
  http://localhost:3000/api/upload/products/prod-123/images \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "image=@/path/to/image.jpg"
```

### Using MinIO Console

1. Open `http://localhost:9001`
2. Login: `minioadmin` / `minioadmin123`
3. Browse buckets and verify uploaded files

---

## API Summary

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/upload/products/:id/images` | POST | JWT | Upload product image |
| `/api/upload/users/avatar` | POST | JWT | Upload user avatar |
| `/api/upload/signed-url` | GET | JWT | Get pre-signed URL |
