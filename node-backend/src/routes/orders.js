import express from 'express';
import { body, validationResult } from 'express-validator';
import pythonServiceClient from '../services/pythonServiceClient.js';
import {
  authMiddleware,
  adminMiddleware,
  requireOrderOwnership,
  filterByOwnership,
  keycloakRequireAnyRole,
} from '../middleware/index.js';
import logger from '../config/logger.js';
import { v4 as uuidv4 } from 'uuid';
import { ordersCreated, databaseOperations } from '../metrics.js';
import tracer, { context } from '../tracing.js';

/**
 * Enrich a span with persistent identity attributes from the authenticated user.
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

const orderValidator = [
  body('items').isArray().notEmpty().withMessage('Items array is required'),
  body('items.*.product_id').notEmpty().withMessage('Product ID is required'),
  body('items.*.quantity').isInt({ min: 1 }).withMessage('Valid quantity is required'),
  body('shipping_address').trim().notEmpty().withMessage('Shipping address is required'),
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

// Get user orders
// Platform admin: all orders
// Merchant admin: orders containing their products (Phase 2 enhancement)
// Regular user: only their own orders
router.get(
  '/',
  authMiddleware,
  filterByOwnership({ filterField: 'user_id', allowMerchantFilter: true }),
  async (req, res, next) => {
    // Create child span for this service's operation
    const span = tracer.startSpan('mongodb.find', {
      attributes: {
        'db.system': 'mongodb',
        'db.name': 'nitte_merch_shop',
        'db.operation': 'find',
        'db.mongodb.collection': 'orders',
        'service.name': 'nitte-api-gateway'
      }
    }, context.active());
    attachIdentityToSpan(span, req);

    try {
      // Use ownership filter set by middleware
      const filter = req.ownershipFilter || { user_id: req.user.userId };
      
      // If filtering by merchant_id, query MongoDB directly
      // (Python service only supports user_id filtering)
      if (filter.merchant_id) {
        const { getMongoClient } = await import('../config/database.js');
        const db = getMongoClient().db();
        const orders = await db.collection('orders')
          .find({ $or: [{ merchant_id: filter.merchant_id }, { merchant_ids: filter.merchant_id }] })
          .sort({ created_at: -1 })
          .toArray();
        
        // Normalize _id to string
        const normalized = orders.map(o => ({ ...o, _id: o._id.toString() }));
        
        databaseOperations.inc({ operation: 'list_orders', status: 'success' });
        span.setAttributes({
          'db.mongodb.records_returned': normalized.length || 0,
          'http.status_code': 200,
          'ownership.filter': JSON.stringify(filter),
        });

        return res.status(200).json({
          success: true,
          data: normalized,
          _meta: {
            ownership: req.ownership || { level: 'merchant', filter: filter },
          }
        });
      }

      const userId = filter.user_id || null;
      const orders = await pythonServiceClient.getOrders(userId);
      databaseOperations.inc({ operation: 'list_orders', status: 'success' });

      span.setAttributes({
        'db.mongodb.records_returned': orders.length || 0,
        'http.status_code': 200,
        'ownership.filter': JSON.stringify(filter),
      });

      res.status(200).json({
        success: true,
        data: orders,
        _meta: {
          ownership: req.ownership || { level: 'user', filter: filter },
        }
      });
    } catch (error) {
      logger.error('Failed to fetch orders', { error: error.message });
      span.setAttributes({
        'error': true,
        'error.message': error.message,
        'http.status_code': 500,
      });
      res.status(500).json({
        success: false,
        message: 'Failed to fetch orders',
      });
    } finally {
      span.end();
    }
  }
);

// Get order by ID
router.get(
  '/:id',
  authMiddleware,
  requireOrderOwnership,
  async (req, res, next) => {
    const { id } = req.params;

    // Create child span for this service's operation
    const span = tracer.startSpan('mongodb.find_one', {
      attributes: {
        'db.system': 'mongodb',
        'db.name': 'nitte_merch_shop',
        'db.operation': 'find_one',
        'db.mongodb.collection': 'orders',
        'db.mongodb.query.id': id,
        'service.name': 'nitte-api-gateway'
      }
    }, context.active());
    attachIdentityToSpan(span, req);

    try {
      // Order is already attached by requireOrderOwnership middleware
      const order = req.resource || await pythonServiceClient.getOrderById(id);

      span.setAttributes({
        'http.status_code': 200,
        'ownership.level': req.ownership?.level || 'unknown',
      });

      res.status(200).json({
        success: true,
        data: order,
        _meta: {
          ownership: req.ownership,
        }
      });
    } catch (error) {
      if (error.message === 'Order not found') {
        span.setAttributes({
          'http.status_code': 404,
          'error': true,
        });
        span.end();
        return res.status(404).json({
          success: false,
          message: 'Order not found',
        });
      }
      logger.error('Failed to fetch order', { error: error.message });
      span.setAttributes({
        'error': true,
        'error.message': error.message,
        'http.status_code': 500,
      });
      res.status(500).json({
        success: false,
        message: 'Failed to fetch order',
      });
    } finally {
      span.end();
    }
  }
);

// Create order
router.post(
  '/',
  authMiddleware,
  orderValidator,
  handleValidationErrors,
  async (req, res, next) => {
    // Create child span for this service's operation
    const span = tracer.startSpan('mongodb.insert', {
      attributes: {
        'db.system': 'mongodb',
        'db.name': 'nitte_merch_shop',
        'db.operation': 'insert',
        'db.mongodb.collection': 'orders',
        'service.name': 'nitte-api-gateway'
      }
    }, context.active());
    attachIdentityToSpan(span, req);

    try {
      // Look up merchant_ids from items' products
      const { getMongoClient } = await import('../config/database.js');
      const db = getMongoClient().db();
      const productIds = req.body.items.map(item => item.product_id);
      
      let merchantIds = [];
      let itemsWithPrice = req.body.items;
      try {
        const { ObjectId } = await import('mongodb');
        const products = await db.collection('products').find({
          $or: [
            { _id: { $in: productIds.filter(id => ObjectId.isValid(id)).map(id => new ObjectId(id)) } },
            { _id: { $in: productIds } },
          ]
        }).project({ merchant_id: 1, price: 1 }).toArray();
        merchantIds = [...new Set(products.map(p => p.merchant_id).filter(Boolean))];
        
        // Enrich items with price from product catalog (required by Python service)
        const priceMap = {};
        products.forEach(p => { priceMap[p._id.toString()] = p.price; });
        itemsWithPrice = req.body.items.map(item => ({
          ...item,
          price: item.price || priceMap[item.product_id] || 0,
        }));
      } catch (lookupErr) {
        logger.debug('Could not look up merchant_ids for order:', lookupErr.message);
      }

      const orderData = {
        order_id: `ORD-${uuidv4()}`,
        user_id: req.user.userId,
        user_email: req.user.email,
        items: itemsWithPrice,
        shipping_address: req.body.shipping_address,
        region: req.body.region || 'south',
        notes: req.body.notes || '',
        status: 'pending',
        merchant_ids: merchantIds,
        merchant_id: merchantIds[0] || null,
        created_at: new Date(),
      };

      const order = await pythonServiceClient.createOrder(orderData);
      ordersCreated.inc();
      databaseOperations.inc({ operation: 'create_order', status: 'success' });
      
      span.setAttributes({ 'http.status_code': 201 });
      
      res.status(201).json({
        success: true,
        message: 'Order created successfully',
        data: order,
      });
    } catch (error) {
      logger.error('Failed to create order', { error: error.message });
      databaseOperations.inc({ operation: 'create_order', status: 'failed' });
      span.setAttributes({
        'error': true,
        'error.message': error.message,
        'http.status_code': 500,
      });
      res.status(500).json({
        success: false,
        message: 'Failed to create order',
      });
    } finally {
      span.end();
    }
  }
);

// Update order
// Update order
// Requires: order:update client role OR ownership OR platform-admin OR merchant roles
router.put(
  '/:id',
  authMiddleware,
  keycloakRequireAnyRole([
    { type: 'client', role: 'nitte-client:order:update' },
    'platform-admin',
    'admin',
    'merchant-admin',
    'merchant',
    'merchant-amazon',
    'merchant-flipkart',
  ]),
  requireOrderOwnership,
  async (req, res, next) => {
    const { id } = req.params;

    // Create child span for this service's operation
    const span = tracer.startSpan('mongodb.update', {
      attributes: {
        'db.system': 'mongodb',
        'db.name': 'nitte_merch_shop',
        'db.operation': 'update',
        'db.mongodb.collection': 'orders',
        'db.mongodb.query.id': id,
        'service.name': 'nitte-api-gateway'
      }
    }, context.active());
    attachIdentityToSpan(span, req);

    try {
      const updateData = {
        status: req.body.status,
        notes: req.body.notes,
      };

      const order = await pythonServiceClient.updateOrder(id, updateData);
      span.setAttributes({
        'http.status_code': 200,
        'ownership.level': req.ownership?.level || 'unknown',
      });
      res.status(200).json({
        success: true,
        message: 'Order updated successfully',
        data: order,
        _meta: {
          ownership: req.ownership,
        }
      });
    } catch (error) {
      logger.error('Failed to update order', { error: error.message });
      span.setAttributes({
        'error': true,
        'error.message': error.message,
        'http.status_code': 500,
      });
      res.status(500).json({
        success: false,
        message: 'Failed to update order',
      });
    } finally {
      span.end();
    }
  }
);

export default router;
