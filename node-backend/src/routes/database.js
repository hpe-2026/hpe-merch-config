import express from 'express';
import { getMongoClient } from '../config/database.js';
import { authMiddleware, adminMiddleware } from '../middleware/index.js';
import logger from '../config/logger.js';
import { ObjectId } from 'mongodb';

const router = express.Router();

/**
 * GET /api/v1/admin/database/collections
 * List all collections with document counts
 */
router.get('/collections', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const db = getMongoClient().db();
    const collections = await db.listCollections().toArray();

    const result = await Promise.all(
      collections.map(async (col) => {
        const count = await db.collection(col.name).estimatedDocumentCount();
        return { name: col.name, type: col.type, count };
      })
    );

    result.sort((a, b) => a.name.localeCompare(b.name));
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('Failed to list collections:', error.message);
    res.status(500).json({ success: false, message: 'Failed to list collections' });
  }
});

/**
 * GET /api/v1/admin/database/collections/:name
 * Get documents from a collection (paginated)
 */
router.get('/collections/:name', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const db = getMongoClient().db();
    const { name } = req.params;
    const skip = parseInt(req.query.skip) || 0;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);

    const docs = await db.collection(name).find({}).skip(skip).limit(limit).toArray();
    const total = await db.collection(name).estimatedDocumentCount();

    res.json({ success: true, data: docs, total, skip, limit });
  } catch (error) {
    logger.error(`Failed to get documents from ${req.params.name}:`, error.message);
    res.status(500).json({ success: false, message: 'Failed to get documents' });
  }
});

/**
 * PUT /api/v1/admin/database/collections/:name/:id
 * Update a document
 */
router.put('/collections/:name/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const db = getMongoClient().db();
    const { name, id } = req.params;
    const update = req.body;

    // Remove _id from update payload
    delete update._id;

    const filter = ObjectId.isValid(id) ? { _id: new ObjectId(id) } : { _id: id };
    const result = await db.collection(name).updateOne(filter, { $set: update });

    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }

    res.json({ success: true, message: 'Document updated' });
  } catch (error) {
    logger.error(`Failed to update document:`, error.message);
    res.status(500).json({ success: false, message: 'Failed to update document' });
  }
});

/**
 * DELETE /api/v1/admin/database/collections/:name/:id
 * Delete a document
 */
router.delete('/collections/:name/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const db = getMongoClient().db();
    const { name, id } = req.params;

    const filter = ObjectId.isValid(id) ? { _id: new ObjectId(id) } : { _id: id };
    const result = await db.collection(name).deleteOne(filter);

    if (result.deletedCount === 0) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }

    res.json({ success: true, message: 'Document deleted' });
  } catch (error) {
    logger.error(`Failed to delete document:`, error.message);
    res.status(500).json({ success: false, message: 'Failed to delete document' });
  }
});

/**
 * GET /api/v1/admin/database/sharding
 * Get sharding status — cluster info, shard distribution, zones
 */
router.get('/sharding', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const client = getMongoClient();
    const adminDb = client.db('admin');
    const configDb = client.db('config');

    // Get shard list
    const shards = await configDb.collection('shards').find({}).toArray();

    // Get chunk distribution for orders
    const chunks = await configDb.collection('chunks')
      .find({ ns: 'nitte_merch.orders' })
      .toArray();

    // Count orders per shard by querying chunks
    const shardChunks = {};
    for (const shard of shards) {
      shardChunks[shard._id] = {
        id: shard._id,
        host: shard.host,
        tags: shard.tags || [],
        chunks: chunks.filter(c => c.shard === shard._id).length,
      };
    }

    // Get collection sharding info
    const collections = await configDb.collection('collections')
      .find({ _id: { $regex: /^nitte_merch\./ } })
      .toArray();

    // Get zone info
    const tags = await configDb.collection('tags')
      .find({ ns: 'nitte_merch.orders' })
      .toArray();

    // Get order counts per region directly
    const db = client.db('nitte_merch');
    let regionCounts = [];
    try {
      regionCounts = await db.collection('orders').aggregate([
        { $group: { _id: '$region', count: { $sum: 1 } } }
      ]).toArray();
    } catch (e) { /* may fail if no orders yet */ }

    res.json({
      success: true,
      data: {
        shards: Object.values(shardChunks),
        shardedCollections: collections.map(c => ({
          ns: c._id,
          key: c.key,
          unique: c.unique || false,
        })),
        zones: tags.map(t => ({
          zone: t.tag,
          min: t.min,
          max: t.max,
        })),
        ordersByRegion: regionCounts,
        totalChunks: chunks.length,
      },
    });
  } catch (error) {
    logger.error('Failed to get sharding status:', error.message);
    res.status(500).json({ success: false, message: 'Failed to get sharding status' });
  }
});

export default router;
