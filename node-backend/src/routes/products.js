import express from 'express';
import { body, validationResult } from 'express-validator';
import pythonServiceClient from '../services/pythonServiceClient.js';
import {
  authMiddleware,
  adminMiddleware,
  requireProductOwnership,
  setOwnershipOnCreate,
  keycloakRequireClientRole,
  keycloakRequireAnyRole,
  filterByOwnership,
} from '../middleware/index.js';
import { getMongoClient } from '../config/database.js';
import logger from '../config/logger.js';
import { productsViewed, databaseOperations } from '../metrics.js';
import tracer, { context } from '../tracing.js';
import config from '../config/index.js';

/**
 * Transform MinIO image URLs to backend proxy URLs (avoids CORS issues)
 * Converts: http://localhost:9000/bucket/path/image.png
 * To: /api/v1/upload/images/bucket/path/image.png
 */
const transformImageUrl = (url) => {
  if (!url) return null;
  // If already a proxy URL, return as-is
  if (url.includes('/api/v1/upload/images/')) return url;
  // Convert MinIO URL to proxy URL
  const minioPattern = /http:\/\/[^:]+:9000\/(.*)/;
  const match = url.match(minioPattern);
  if (match) {
    return `${config.api_base_url || ''}/api/v1/upload/images/${match[1]}`;
  }
  return url;
};

/**
 * Transform all image URLs in a product object
 */
const transformProductImages = (product) => {
  if (!product) return product;
  return {
    ...product,
    image_url: transformImageUrl(product.image_url),
  };
};

/**
 * Enrich a span with persistent identity attributes when a user is present.
 */
function attachIdentityToSpan(span, req) {
  const user = req?.user;
  if (user) {
    span.setAttribute('keycloak.subject_id', user.userId || 'anonymous');
    span.setAttribute('keycloak.user_email', user.email || 'anonymous');
    span.setAttribute('keycloak.user_roles', JSON.stringify(user.roles || []));
  }
}

const router = express.Router();

const productValidator = [
  body('name').trim().notEmpty().withMessage('Product name is required'),
  body('description').trim().notEmpty().withMessage('Description is required'),
  body('category').trim().notEmpty().withMessage('Category is required'),
  body('price').isFloat({ min: 0 }).withMessage('Valid price is required'),
  body('stock').isInt({ min: 0 }).withMessage('Valid stock quantity is required'),
];

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array(),
    });
  }
  next();
};

// Get all products - filtered by merchant for merchant users
router.get('/', authMiddleware, filterByOwnership({ allowMerchantFilter: true }), async (req, res, next) => {
  // Create child span for this service's operation
  const span = tracer.startSpan('mongodb.find', {
    attributes: {
      'db.system': 'mongodb',
      'db.name': 'nitte_merch_shop',
      'db.operation': 'find',
      'db.mongodb.collection': 'products',
      'service.name': 'nitte-api-gateway'
    }
  }, context.active());
  attachIdentityToSpan(span, req);

  try {
    // Query MongoDB directly with ownership filter
    const db = getMongoClient().db();
    const filter = req.ownershipFilter || {};
    
    logger.info('Fetching products with filter', { filter, userId: req.user?.userId, merchantId: req.user?.merchantId });
    
    const products = await db.collection('products').find(filter).toArray();
    
    // Transform image URLs to avoid CORS issues
    const transformedProducts = products.map(transformProductImages);
    
    productsViewed.inc();
    databaseOperations.inc({ operation: 'list_products', status: 'success' });
    
    span.setAttributes({
      'db.mongodb.records_returned': products.length || 0,
      'http.status_code': 200,
    });
    
    res.status(200).json({
      success: true,
      data: transformedProducts,
    });
  } catch (error) {
    logger.error('Failed to fetch products', { error: error.message });
    databaseOperations.inc({ operation: 'list_products', status: 'failed' });
    span.setAttributes({
      'error': true,
      'error.message': error.message,
      'http.status_code': 500,
    });
    res.status(500).json({
      success: false,
      message: 'Failed to fetch products',
    });
  } finally {
    span.end();
  }
});

// Get product by ID
router.get('/:id', async (req, res, next) => {
  const { id } = req.params;
  
  // Create child span for this service's operation
  const span = tracer.startSpan('mongodb.find_one', {
    attributes: {
      'db.system': 'mongodb',
      'db.name': 'nitte_merch_shop',
      'db.operation': 'find_one',
      'db.mongodb.collection': 'products',
      'db.mongodb.query.id': id,
      'service.name': 'nitte-api-gateway'
    }
  }, context.active());
  attachIdentityToSpan(span, req);

  try {
    const product = await pythonServiceClient.getProductById(id);
    productsViewed.inc();
    databaseOperations.inc({ operation: 'get_product', status: 'success' });
    
    if (span && typeof span.setAttribute === 'function') {
      span.setAttribute('status.code', 'OK');
    }
    
    // Transform image URL to avoid CORS issues
    const transformedProduct = transformProductImages(product);
    
    res.status(200).json({
      success: true,
      data: transformedProduct,
    });
  } catch (error) {
    if (error.message === 'Product not found') {
      if (span && typeof span.setAttribute === 'function') {
        span.setAttribute('status.code', 'NOT_FOUND');
      }
      if (span && typeof span.end === 'function') {
        span.end();
      }
      return res.status(404).json({
        success: false,
        message: 'Product not found',
      });
    }
    logger.error('Failed to fetch product', { error: error.message });
    if (span && typeof span.setAttribute === 'function') {
      span.setAttribute('error', true);
      span.setAttribute('error.message', error.message);
    }
    res.status(500).json({
      success: false,
      message: 'Failed to fetch product',
    });
  } finally {
    if (span && typeof span.end === 'function') {
      span.end();
    }
  }
});

// Create product
// Requires: product:create client role OR platform-admin/merchant-admin realm role
router.post(
  '/',
  authMiddleware,
  keycloakRequireAnyRole([
    { type: 'client', role: 'nitte-client:product:create' },
    'platform-admin',
    'merchant-admin',
  ]),
  setOwnershipOnCreate({ userIdField: 'created_by', merchantIdField: 'merchant_id' }),
  productValidator,
  handleValidationErrors,
  async (req, res, next) => {
    try {
      // productData now includes created_by and merchant_id from setOwnershipOnCreate middleware
      const productData = {
        name: req.body.name,
        description: req.body.description,
        category: req.body.category,
        price: req.body.price,
        stock: req.body.stock,
        image_url: req.body.image_url || null,
        created_by: req.body.created_by,
        merchant_id: req.body.merchant_id || null,
      };

      const product = await pythonServiceClient.createProduct(productData);
      res.status(201).json({
        success: true,
        message: 'Product created successfully',
        data: transformProductImages(product),
      });
    } catch (error) {
      logger.error('Failed to create product', { error: error.message });
      res.status(500).json({
        success: false,
        message: 'Failed to create product',
      });
    }
  }
);

// Update product
// Requires: product:update client role OR ownership OR admin
router.put(
  '/:id',
  authMiddleware,
  keycloakRequireAnyRole([
    { type: 'client', role: 'nitte-client:product:update' },
    'platform-admin',
    'merchant-admin',
  ]),
  requireProductOwnership,
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const productData = req.body;

      // Prevent changing ownership fields
      delete productData.created_by;
      delete productData.merchant_id;

      const product = await pythonServiceClient.updateProduct(id, productData);
      res.status(200).json({
        success: true,
        message: 'Product updated successfully',
        data: transformProductImages(product),
      });
    } catch (error) {
      logger.error('Failed to update product', { error: error.message });
      res.status(500).json({
        success: false,
        message: 'Failed to update product',
      });
    }
  }
);

// Delete product
// Requires: product:delete client role OR ownership OR admin
router.delete(
  '/:id',
  authMiddleware,
  keycloakRequireAnyRole([
    { type: 'client', role: 'nitte-client:product:delete' },
    'platform-admin',
    'merchant-admin',
  ]),
  requireProductOwnership,
  async (req, res, next) => {
    try {
      const { id } = req.params;
      await pythonServiceClient.deleteProduct(id);
      res.status(200).json({
        success: true,
        message: 'Product deleted successfully',
      });
    } catch (error) {
      logger.error('Failed to delete product', { error: error.message });
      res.status(500).json({
        success: false,
        message: 'Failed to delete product',
      });
    }
  }
);

export default router;
