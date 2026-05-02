// MongoDB Initialization Script
// Creates restricted DB users for application access
// Run automatically by MongoDB container on first startup

db = db.getSiblingDB('nitte_merch');

// Create application read/write user (scoped access)
db.createUser({
  user: 'app_writer',
  pwd: 'app_writer_pass',
  roles: [
    { role: 'readWrite', db: 'nitte_merch' }
  ]
});

// Create application read-only user
db.createUser({
  user: 'app_reader',
  pwd: 'app_reader_pass',
  roles: [
    { role: 'read', db: 'nitte_merch' }
  ]
});

// Create collections
db.createCollection('products');
db.createCollection('orders');
db.createCollection('user_verifications');

// Seed sample products for demo
const products = [
  {
    _id: ObjectId(),
    name: 'NITTE Alumni Hoodie',
    description: 'Premium cotton hoodie with embroidered NITTE Alumni logo. Available in Navy Blue and Black.',
    category: 'apparel',
    price: 1299.00,
    stock: 50,
    image_url: 'https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=600&q=80',
    exclusive: true,
    created_at: new Date(),
    updated_at: new Date()
  },
  {
    _id: ObjectId(),
    name: 'NITTE Alumni T-Shirt',
    description: 'Comfortable round-neck t-shirt with NITTE print. Unisex fit.',
    category: 'apparel',
    price: 499.00,
    stock: 100,
    image_url: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=600&q=80',
    exclusive: false,
    created_at: new Date(),
    updated_at: new Date()
  },
  {
    _id: ObjectId(),
    name: 'NITTE Coffee Mug',
    description: 'Ceramic coffee mug with NITTE logo. Microwave safe. 350ml capacity.',
    category: 'accessories',
    price: 299.00,
    stock: 200,
    image_url: 'https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?w=600&q=80',
    exclusive: false,
    created_at: new Date(),
    updated_at: new Date()
  },
  {
    _id: ObjectId(),
    name: 'NITTE Laptop Sticker Pack',
    description: 'Set of 5 premium vinyl stickers for laptops and water bottles.',
    category: 'accessories',
    price: 149.00,
    stock: 300,
    image_url: 'https://images.unsplash.com/photo-1611532736597-de2d4265fba3?w=600&q=80',
    exclusive: false,
    created_at: new Date(),
    updated_at: new Date()
  },
  {
    _id: ObjectId(),
    name: 'NITTE Alumni Cap',
    description: 'Adjustable baseball cap with embroidered NITTE Alumni badge.',
    category: 'apparel',
    price: 399.00,
    stock: 75,
    image_url: 'https://images.unsplash.com/photo-1588850561407-ed78c282e89b?w=600&q=80',
    exclusive: true,
    created_at: new Date(),
    updated_at: new Date()
  }
];

db.products.insertMany(products);

// Seed admin user in user_verifications for simple auth demo
const adminUser = {
  _id: ObjectId(),
  email: 'admin@nitte.edu',
  password: 'admin@123', // plaintext for demo; bcrypt fallback exists in authSimple.js
  name: 'Admin User',
  alumni_id: 'ADMIN-001',
  department: 'Administration',
  graduation_year: 2010,
  role: 'admin',
  status: 'approved',
  registration_timestamp: new Date(),
  approved_by: 'system',
  approval_timestamp: new Date(),
  events: [
    {
      type: 'registered',
      timestamp: new Date(),
      actor: 'system',
      reason: 'Initial seed'
    },
    {
      type: 'approved',
      timestamp: new Date(),
      actor: 'system',
      reason: 'Auto-approved seed admin'
    }
  ]
};

db.user_verifications.insertOne(adminUser);

// Create indexes
db.products.createIndex({ name: 1 });
db.products.createIndex({ category: 1 });
db.products.createIndex({ price: 1 });
db.orders.createIndex({ user_id: 1 });
db.orders.createIndex({ order_id: 1 }, { unique: true });
db.user_verifications.createIndex({ email: 1 });
db.user_verifications.createIndex({ status: 1 });

print('MongoDB initialization complete: users created, products seeded, indexes built.');
