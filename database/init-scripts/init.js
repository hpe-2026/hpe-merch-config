db = db.getSiblingDB('nitte_merch_shop');

// Create collections
db.createCollection('products');
db.createCollection('orders');
db.createCollection('users');
db.createCollection('policies');

// Create indexes for products
db.products.createIndex({ name: 1 });
db.products.createIndex({ category: 1 });
db.products.createIndex({ price: 1 });

// Create indexes for orders
db.orders.createIndex({ user_id: 1 });
db.orders.createIndex({ order_id: 1 }, { unique: true });
db.orders.createIndex({ status: 1 });
db.orders.createIndex({ created_at: -1 });

// Create indexes for users
db.users.createIndex({ email: 1 }, { unique: true });

// Create indexes for policies (RBAC)
db.policies.createIndex({ actions: 1, enabled: 1 });
db.policies.createIndex({ roles: 1, enabled: 1 });
db.policies.createIndex({ name: 1 }, { unique: true });
db.policies.createIndex({ tags: 1 });
db.policies.createIndex({ createdAt: 1 });

// Insert test users (with hashed passwords for authentication)
db.users.insertMany([
  {
    email: 'admin@test.com',
    name: 'Admin User',
    password: '$2b$10$YIjlrPNoS0XtqYvvjHh1KOmktzxjSSZ.XVXp0o9weS4KR5bOKWkvO',
    role: 'admin',
    created_at: new Date(),
    updated_at: new Date()
  },
  {
    email: 'user@test.com',
    name: 'Test User',
    password: '$2b$10$YIjlrPNoS0XtqYvvjHh1KOmktzxjSSZ.XVXp0o9weS4KR5bOKWkvO',
    role: 'user',
    created_at: new Date(),
    updated_at: new Date()
  },
  {
    email: 'guest@test.com',
    name: 'Guest User',
    password: '$2b$10$YIjlrPNoS0XtqYvvjHh1KOmktzxjSSZ.XVXp0o9weS4KR5bOKWkvO',
    role: 'guest',
    created_at: new Date(),
    updated_at: new Date()
  }
]);

// Insert sample products
db.products.insertMany([
  {
    name: 'NITTE Official T-Shirt',
    description: 'Official NITTE merchandise t-shirt made of premium cotton',
    category: 'clothing',
    price: 3999,
    stock: 100,
    image_url: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=300&h=300&fit=crop',
    created_at: new Date(),
    updated_at: new Date()
  },
  {
    name: 'NITTE College Bag',
    description: 'Durable college bag with multiple compartments perfect for students',
    category: 'bags',
    price: 4999,
    stock: 50,
    image_url: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=300&h=300&fit=crop',
    created_at: new Date(),
    updated_at: new Date()
  },
  {
    name: 'NITTE Water Bottle',
    description: 'Eco-friendly water bottle with NITTE branding',
    category: 'accessories',
    price: 799,
    stock: 200,
    image_url: 'https://images.unsplash.com/photo-1602143407151-7e6a30e0f0f5?w=400&h=400&fit=crop',
    created_at: new Date(),
    updated_at: new Date()
  },
  {
    name: 'NITTE Hoodie',
    description: 'Warm and comfortable hoodie for college and casual wear',
    category: 'clothing',
    price: 2499,
    stock: 75,
    image_url: 'https://images.unsplash.com/photo-1556821552-7f41c5d440db?w=400&h=400&fit=crop',
    created_at: new Date(),
    updated_at: new Date()
  },
  {
    name: 'NITTE Cap',
    description: 'Classic baseball cap with embroidered NITTE logo',
    category: 'accessories',
    price: 699,
    stock: 150,
    image_url: 'https://images.unsplash.com/photo-1588850561407-ed78c282e89b?w=400&h=400&fit=crop',
    created_at: new Date(),
    updated_at: new Date()
  }
]);

print('Database initialized successfully');
