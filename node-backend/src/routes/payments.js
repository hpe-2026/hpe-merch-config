import express from 'express';
import crypto from 'crypto';
import { createRequire } from 'module';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware } from '../middleware/index.js';
import logger from '../config/logger.js';
import pythonServiceClient from '../services/pythonServiceClient.js';
import { ordersCreated } from '../metrics.js';

const require = createRequire(import.meta.url);
const Razorpay = require('razorpay');

const router = express.Router();

const getRazorpay = () =>
  new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });

/**
 * POST /api/v1/payments/create-order
 * Creates a Razorpay order and returns the order ID + key_id to the frontend.
 * Body: { amount: number }  — amount in INR (rupees)
 */
router.post('/create-order', authMiddleware, async (req, res) => {
  try {
    const { amount } = req.body;

    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid amount' });
    }

    const options = {
      amount: Math.round(Number(amount) * 100),
      currency: 'INR',
      receipt: `rcpt_${Date.now()}`,
      notes: {
        user_id: req.user.userId,
        user_email: req.user.email,
      },
    };

    const order = await getRazorpay().orders.create(options);

    res.status(200).json({
      success: true,
      data: {
        razorpay_order_id: order.id,
        amount: order.amount,
        currency: order.currency,
        key_id: process.env.RAZORPAY_KEY_ID,
      },
    });
  } catch (error) {
    logger.error('Razorpay create-order error:', error.message);
    res.status(500).json({ success: false, message: 'Payment initiation failed' });
  }
});

/**
 * POST /api/v1/payments/verify
 * Verifies Razorpay HMAC signature, then creates the order in the DB.
 * Body: { razorpay_order_id, razorpay_payment_id, razorpay_signature, items, shipping_address, notes }
 */
router.post('/verify', authMiddleware, async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      items,
      shipping_address,
      notes,
    } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ success: false, message: 'Missing payment fields' });
    }

    // Verify HMAC-SHA256 signature
    const hmac = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET);
    hmac.update(`${razorpay_order_id}|${razorpay_payment_id}`);
    const expectedSignature = hmac.digest('hex');

    if (expectedSignature !== razorpay_signature) {
      logger.warn('Razorpay signature mismatch', { razorpay_order_id, razorpay_payment_id });
      return res.status(400).json({ success: false, message: 'Payment verification failed — invalid signature' });
    }

    // Signature valid — create the order in DB
    const orderData = {
      order_id: `ORD-${uuidv4()}`,
      user_id: req.user.userId,
      user_email: req.user.email,
      items,
      shipping_address: shipping_address || 'Not provided',
      notes: notes || '',
      status: 'confirmed',
      payment: {
        provider: 'razorpay',
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
        status: 'paid',
      },
      created_at: new Date(),
    };

    const order = await pythonServiceClient.createOrder(orderData);
    ordersCreated.inc();

    res.status(201).json({
      success: true,
      message: 'Payment verified. Order placed successfully.',
      data: order,
    });
  } catch (error) {
    logger.error('Razorpay verify error:', error.message);
    res.status(500).json({ success: false, message: 'Order creation failed after payment' });
  }
});

export default router;
