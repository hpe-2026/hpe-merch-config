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

// Note: Products are seeded by scripts/seed-products.js after MinIO is ready
// This ensures product images are stored in MinIO (not external URLs)
// with proper merchant ownership (created_by, merchant_id fields)
// 
// To seed products manually:
//   docker compose exec node-backend node scripts/seed-products.js
//
// Or wait for the seeding service to run automatically.

// Create placeholder for products collection
db.createCollection('products');

print('Products collection ready. Run seed-products.js to seed with MinIO images.');

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
db.products.createIndex({ merchant_id: 1 });  // For merchant filtering
db.products.createIndex({ created_by: 1 });  // For ownership queries
db.orders.createIndex({ user_id: 1 });
db.orders.createIndex({ order_id: 1 }, { unique: true });
db.user_verifications.createIndex({ email: 1 });
db.user_verifications.createIndex({ status: 1 });

print('MongoDB initialization complete: users created, indexes built. Products to be seeded via seed-products.js.');
