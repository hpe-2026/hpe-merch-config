#!/usr/bin/env node
/**
 * Product Seeding Script with MinIO Image Upload
 * 
 * This script:
 * 1. Generates placeholder product images
 * 2. Uploads them to MinIO (nitte-products bucket)
 * 3. Creates products in MongoDB with MinIO URLs and merchant ownership
 * 
 * Usage: node scripts/seed-products.mjs
 */

import { S3Client, PutObjectCommand, HeadBucketCommand } from '@aws-sdk/client-s3';
import { MongoClient, ObjectId } from 'mongodb';
import https from 'https';

// Configuration
const CONFIG = {
  // MinIO/S3 Configuration
  minio: {
    endpoint: process.env.S3_ENDPOINT || 'http://localhost:9000',
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY || 'minioadmin',
      secretAccessKey: process.env.S3_SECRET_KEY || process.env.MINIO_ROOT_PASSWORD || 'minioadmin123',
    },
    forcePathStyle: true,
  },
  bucket: process.env.S3_PRODUCTS_BUCKET || 'nitte-products',
  
  // MongoDB Configuration
  mongodb: {
    url: process.env.MONGODB_URL || 'mongodb://app_writer:app_writer_pass@localhost:27017/nitte_merch?authSource=nitte_merch',
    dbName: 'nitte_merch',
  },
  
  // Merchant Configuration
  merchant: {
    id: 'nitte-official-store',
    userId: 'merchant-admin-nitte',
    email: 'merchant-admin@nitte.edu',
    name: 'NITTE Official Store',
  },
  
  // Sample products to seed
  products: [
    {
      name: 'NITTE Alumni Hoodie',
      description: 'Premium cotton hoodie with embroidered NITTE Alumni logo. Available in Navy Blue and Black. Perfect for keeping warm while showing your NITTE pride.',
      category: 'apparel',
      price: 1299.00,
      stock: 50,
      imageText: 'NITTE+Hoodie',
      exclusive: true,
    },
    {
      name: 'NITTE Alumni T-Shirt',
      description: 'Comfortable round-neck t-shirt with NITTE print. Unisex fit. Made from 100% organic cotton for everyday comfort.',
      category: 'apparel',
      price: 499.00,
      stock: 100,
      imageText: 'NITTE+T-Shirt',
      exclusive: false,
    },
    {
      name: 'NITTE Coffee Mug',
      description: 'Ceramic coffee mug with NITTE logo. Microwave safe. 350ml capacity. Perfect for your morning coffee.',
      category: 'accessories',
      price: 299.00,
      stock: 200,
      imageText: 'NITTE+Mug',
      exclusive: false,
    },
    {
      name: 'NITTE Laptop Sticker Pack',
      description: 'Set of 5 premium vinyl stickers for laptops and water bottles. Waterproof and durable.',
      category: 'accessories',
      price: 149.00,
      stock: 300,
      imageText: 'NITTE+Stickers',
      exclusive: false,
    },
    {
      name: 'NITTE Alumni Cap',
      description: 'Adjustable baseball cap with embroidered NITTE Alumni badge. One size fits all.',
      category: 'apparel',
      price: 399.00,
      stock: 75,
      imageText: 'NITTE+Cap',
      exclusive: true,
    },
    {
      name: 'NITTE Notebook',
      description: 'A5 size notebook with NITTE logo on cover. 200 pages, perfect for notes and journaling.',
      category: 'stationery',
      price: 199.00,
      stock: 150,
      imageText: 'NITTE+Notebook',
      exclusive: false,
    },
    {
      name: 'NITTE Water Bottle',
      description: 'Insulated stainless steel water bottle with NITTE branding. Keeps drinks hot or cold for hours.',
      category: 'accessories',
      price: 599.00,
      stock: 80,
      imageText: 'NITTE+Bottle',
      exclusive: false,
    },
    {
      name: 'NITTE Hoodie Premium',
      description: 'Limited edition premium hoodie with gold embossed NITTE logo. Only available to verified alumni.',
      category: 'apparel',
      price: 2499.00,
      stock: 25,
      imageText: 'Premium+Hoodie',
      exclusive: true,
    },
  ],
};

// Initialize S3 client
const s3Client = new S3Client(CONFIG.minio);

/**
 * Download image from URL and return as buffer
 */
async function downloadImage(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: ${response.statusCode}`));
        return;
      }
      
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks)));
      response.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * Generate placeholder image using placehold.co
 */
async function generatePlaceholderImage(text, width = 600, height = 600, bg = '4338ca', fg = 'ffffff') {
  const encodedText = encodeURIComponent(text);
  const url = `https://placehold.co/${width}x${height}/${bg}/${fg}?text=${encodedText}`;
  console.log(`    Downloading from: ${url}`);
  return downloadImage(url);
}

/**
 * Ensure MinIO bucket exists
 */
async function ensureBucket() {
  try {
    await s3Client.send(new HeadBucketCommand({ Bucket: CONFIG.bucket }));
    console.log(`✓ Bucket '${CONFIG.bucket}' exists`);
  } catch (error) {
    if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      console.warn(`Bucket '${CONFIG.bucket}' not found. Ensure MinIO init container ran.`);
      console.log('Attempting to continue anyway...');
    } else {
      throw error;
    }
  }
}

/**
 * Upload image to MinIO
 */
async function uploadImageToMinIO(imageBuffer, productId, fileName) {
  const timestamp = Date.now();
  const key = `seeded/${CONFIG.merchant.id}/${productId}/${timestamp}-${fileName}`;
  
  await s3Client.send(new PutObjectCommand({
    Bucket: CONFIG.bucket,
    Key: key,
    Body: imageBuffer,
    ContentType: 'image/png',
    Metadata: {
      'product-id': productId,
      'merchant-id': CONFIG.merchant.id,
      'seeded': 'true',
    },
  }));
  
  // Construct public URL
  const endpoint = process.env.S3_PUBLIC_ENDPOINT || CONFIG.minio.endpoint;
  return `${endpoint}/${CONFIG.bucket}/${key}`;
}

/**
 * Connect to MongoDB
 */
async function connectMongoDB() {
  const client = new MongoClient(CONFIG.mongodb.url);
  await client.connect();
  console.log('✓ Connected to MongoDB');
  return client;
}

/**
 * Check if products already seeded
 */
async function isAlreadySeeded(db) {
  const count = await db.collection('products').countDocuments({
    merchant_id: CONFIG.merchant.id,
    seeded: true,
  });
  return count > 0;
}

/**
 * Wait for services to be ready
 */
async function waitForServices() {
  console.log('Waiting for services to be ready...\n');
  
  // Wait for MongoDB
  let mongoReady = false;
  for (let i = 0; i < 30; i++) {
    try {
      const client = new MongoClient(CONFIG.mongodb.url, { serverSelectionTimeoutMS: 2000 });
      await client.connect();
      await client.close();
      mongoReady = true;
      console.log('✓ MongoDB is ready');
      break;
    } catch (err) {
      process.stdout.write('.');
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  
  if (!mongoReady) {
    throw new Error('MongoDB not available after 30 seconds');
  }
  
  // Wait a bit for MinIO
  console.log('Waiting for MinIO...');
  await new Promise(r => setTimeout(r, 3000));
  console.log('✓ Proceeding with seeding\n');
}

/**
 * Seed products
 */
async function seedProducts() {
  console.log('\n========================================');
  console.log('Product Seeding with MinIO Images');
  console.log('========================================\n');
  
  try {
    // Wait for services
    await waitForServices();
    
    // Check MinIO bucket
    await ensureBucket();
    
    // Connect to MongoDB
    const mongoClient = await connectMongoDB();
    const db = mongoClient.db(CONFIG.mongodb.dbName);
    
    // Check if already seeded
    if (await isAlreadySeeded(db)) {
      console.log('✓ Products already seeded. Skipping...');
      await mongoClient.close();
      return;
    }
    
    console.log(`Seeding ${CONFIG.products.length} products...\n`);
    
    const seededProducts = [];
    
    for (let i = 0; i < CONFIG.products.length; i++) {
      const product = CONFIG.products[i];
      console.log(`[${i + 1}/${CONFIG.products.length}] ${product.name}`);
      
      // Generate image
      console.log(`  → Generating product image...`);
      const imageBuffer = await generatePlaceholderImage(product.imageText);
      
      // Create product ID
      const productId = new ObjectId().toString();
      
      // Upload to MinIO
      console.log(`  → Uploading to MinIO...`);
      const imageUrl = await uploadImageToMinIO(imageBuffer, productId, 'product.png');
      console.log(`  → Stored at: ${imageUrl.split('/').pop()}`);
      
      // Prepare product document
      const productDoc = {
        _id: new ObjectId(productId),
        name: product.name,
        description: product.description,
        category: product.category,
        price: product.price,
        stock: product.stock,
        image_url: imageUrl,
        image_key: `seeded/${CONFIG.merchant.id}/${productId}/`,
        exclusive: product.exclusive,
        created_by: CONFIG.merchant.userId,
        merchant_id: CONFIG.merchant.id,
        merchant_name: CONFIG.merchant.name,
        seeded: true,
        created_at: new Date(),
        updated_at: new Date(),
      };
      
      seededProducts.push(productDoc);
      console.log(`  ✓ Ready for database\n`);
    }
    
    // Insert into MongoDB
    console.log('→ Inserting products into MongoDB...');
    const result = await db.collection('products').insertMany(seededProducts);
    console.log(`✓ Inserted ${result.insertedCount} products`);
    
    // Create indexes if they don't exist
    console.log('→ Creating indexes...');
    await db.collection('products').createIndex({ merchant_id: 1 });
    await db.collection('products').createIndex({ created_by: 1 });
    await db.collection('products').createIndex({ seeded: 1 });
    console.log('✓ Indexes created');
    
    // Summary
    console.log('\n========================================');
    console.log('Seeding Complete!');
    console.log('========================================');
    console.log(`Merchant: ${CONFIG.merchant.name}`);
    console.log(`Merchant ID: ${CONFIG.merchant.id}`);
    console.log(`Products: ${seededProducts.length}`);
    console.log(`Bucket: ${CONFIG.bucket}`);
    console.log('\nProducts are now available in:');
    console.log('  - Admin Dashboard: http://localhost:5174');
    console.log('  - Merchant Portal: http://localhost:5175');
    console.log('  - API: http://localhost:3000/api/v1/products');
    console.log('  - MinIO: http://localhost:9000 (bucket: nitte-products)');
    console.log('\nAll images stored in MinIO (not external URLs)');
    console.log('========================================\n');
    
    await mongoClient.close();
    
  } catch (error) {
    console.error('\n❌ Seeding failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run if executed directly
seedProducts();

export { seedProducts, CONFIG };
