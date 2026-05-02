import express from 'express';
import { body, validationResult } from 'express-validator';
import pythonServiceClient from '../services/pythonServiceClient.js';
import { authMiddleware, adminMiddleware } from '../middleware/index.js';
import logger from '../config/logger.js';
import { v4 as uuidv4 } from 'uuid';
import { ordersCreated, databaseOperations } from '../metrics.js';
import tracer from '../tracing.js';

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

// Get user orders (all orders for admin, user's orders for regular users)
router.get(
  '/',
  authMiddleware,
  async (req, res, next) => {
    // Create independent span for this service's operation
    const span = tracer.startSpan('mongodb.find', {
      attributes: {
        'db.system': 'mongodb',
        'db.name': 'nitte_merch_shop',
        'db.operation': 'find',
        'db.mongodb.collection': 'orders',
        'service.name': 'nitte-api-gateway'
      }
    });

    try {
      // Admin gets all orders, regular users get only their orders
      const userId = req.user.role === 'admin' ? null : req.user.userId;
      const orders = await pythonServiceClient.getOrders(userId);
      databaseOperations.inc({ operation: 'list_orders', status: 'success' });
      
      span.setAttributes({
        'db.mongodb.records_returned': orders.length || 0,
        'http.status_code': 200,
      });
      
      res.status(200).json({
        success: true,
        data: orders,
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
  async (req, res, next) => {
    const { id } = req.params;
    
    // Create independent span for this service's operation
    const span = tracer.startSpan('mongodb.find_one', {
      attributes: {
        'db.system': 'mongodb',
        'db.name': 'nitte_merch_shop',
        'db.operation': 'find_one',
        'db.mongodb.collection': 'orders',
        'db.mongodb.query.id': id,
        'service.name': 'nitte-api-gateway'
      }
    });

    try {
      const order = await pythonServiceClient.getOrderById(id);

      // Verify user owns this order
      if (order.user_id !== req.user.userId && req.user.role !== 'admin') {
        span.setAttributes({ 'http.status_code': 403 });
        span.end();
        return res.status(403).json({
          success: false,
          message: 'Access denied',
        });
      }

      span.setAttributes({ 'http.status_code': 200 });
      res.status(200).json({
        success: true,
        data: order,
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
    // Create independent span for this service's operation
    const span = tracer.startSpan('mongodb.insert', {
      attributes: {
        'db.system': 'mongodb',
        'db.name': 'nitte_merch_shop',
        'db.operation': 'insert',
        'db.mongodb.collection': 'orders',
        'service.name': 'nitte-api-gateway'
      }
    });

    try {
      const orderData = {
        order_id: `ORD-${uuidv4()}`,
        user_id: req.user.userId,
        user_email: req.user.email,
        items: req.body.items,
        shipping_address: req.body.shipping_address,
        notes: req.body.notes || '',
        status: 'pending',
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

// Update order (admin only)
router.put(
  '/:id',
  authMiddleware,
  adminMiddleware,
  async (req, res, next) => {
    const { id } = req.params;
    
    // Create independent span for this service's operation
    const span = tracer.startSpan('mongodb.update', {
      attributes: {
        'db.system': 'mongodb',
        'db.name': 'nitte_merch_shop',
        'db.operation': 'update',
        'db.mongodb.collection': 'orders',
        'db.mongodb.query.id': id,
        'service.name': 'nitte-api-gateway'
      }
    });

    try {
      const updateData = {
        status: req.body.status,
        notes: req.body.notes,
      };

      const order = await pythonServiceClient.updateOrder(id, updateData);
      span.setAttributes({ 'http.status_code': 200 });
      res.status(200).json({
        success: true,
        message: 'Order updated successfully',
        data: order,
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
