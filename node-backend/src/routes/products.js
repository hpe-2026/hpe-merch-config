import express from 'express';
import { body, validationResult } from 'express-validator';
import pythonServiceClient from '../services/pythonServiceClient.js';
import { authMiddleware, adminMiddleware } from '../middleware/index.js';
import logger from '../config/logger.js';
import { productsViewed, databaseOperations } from '../metrics.js';
import tracer, { context } from '../tracing.js';

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

// Get all products
router.get('/', async (req, res, next) => {
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
    const products = await pythonServiceClient.getProducts();
    productsViewed.inc();
    databaseOperations.inc({ operation: 'list_products', status: 'success' });
    
    span.setAttributes({
      'db.mongodb.records_returned': products.length || 0,
      'http.status_code': 200,
    });
    
    res.status(200).json({
      success: true,
      data: products,
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
    
    res.status(200).json({
      success: true,
      data: product,
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

// Create product (admin only)
router.post(
  '/',
  authMiddleware,
  adminMiddleware,
  productValidator,
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const productData = {
        name: req.body.name,
        description: req.body.description,
        category: req.body.category,
        price: req.body.price,
        stock: req.body.stock,
        image_url: req.body.image_url || null,
      };

      const product = await pythonServiceClient.createProduct(productData);
      res.status(201).json({
        success: true,
        message: 'Product created successfully',
        data: product,
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

// Update product (admin only)
router.put(
  '/:id',
  authMiddleware,
  adminMiddleware,
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const productData = req.body;

      const product = await pythonServiceClient.updateProduct(id, productData);
      res.status(200).json({
        success: true,
        message: 'Product updated successfully',
        data: product,
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

// Delete product (admin only)
router.delete(
  '/:id',
  authMiddleware,
  adminMiddleware,
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
