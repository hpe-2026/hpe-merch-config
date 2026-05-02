/**
 * NITTE Default Policies
 * 
 * Pre-defined policies that seed the database on first startup.
 * These represent the default RBAC rules for the e-commerce system.
 */

const defaultPolicies = [
  // ============================================================================
  // PRODUCT MANAGEMENT POLICIES
  // ============================================================================

  {
    name: 'Guest - View Active Products',
    description: 'Allow guest users to view only active/published products',
    actions: ['list_products', 'view_product'],
    roles: ['guest'],
    effect: 'allow',
    conditions: [
      {
        field: 'resource.status',
        operator: 'equals',
        value: 'active',
      },
    ],
    enabled: true,
    priority: 100,
    tags: ['products', 'guest', 'read-only'],
  },

  {
    name: 'Authenticated User - View Active Products',
    description: 'Allow authenticated users to view active products',
    actions: ['list_products', 'view_product'],
    roles: ['user'],
    effect: 'allow',
    conditions: [
      {
        field: 'resource.status',
        operator: 'in',
        value: ['active', 'limited'],
      },
    ],
    enabled: true,
    priority: 100,
    tags: ['products', 'user', 'read-only'],
  },

  {
    name: 'Admin - View All Products',
    description: 'Allow admin users to view all products regardless of status',
    actions: ['list_products', 'view_product', 'search_products'],
    roles: ['admin'],
    effect: 'allow',
    enabled: true,
    priority: 100,
    tags: ['products', 'admin', 'read'],
  },

  {
    name: 'Admin - Manage Products',
    description: 'Allow admin users to create, update, and delete products',
    actions: ['create_product', 'update_product', 'delete_product', 'manage_inventory'],
    roles: ['admin'],
    effect: 'allow',
    enabled: true,
    priority: 100,
    tags: ['products', 'admin', 'write'],
  },

  {
    name: 'Deny - Guest Create Products',
    description: 'Deny guest users from creating products',
    actions: ['create_product', 'update_product', 'delete_product'],
    roles: ['guest'],
    effect: 'deny',
    enabled: true,
    priority: 200, // Higher priority = evaluated first
    tags: ['products', 'guest', 'write'],
  },

  {
    name: 'Deny - User Manage Products',
    description: 'Deny regular users from managing products (create/update/delete)',
    actions: ['create_product', 'update_product', 'delete_product'],
    roles: ['user'],
    effect: 'deny',
    enabled: true,
    priority: 200,
    tags: ['products', 'user', 'write'],
  },

  // ============================================================================
  // MERCHANT POLICIES (Third-party: Amazon, Flipkart, general merchant)
  // ============================================================================

  {
    name: 'Merchant - View All Products',
    description: 'Allow merchant users to view all products in the catalog',
    actions: ['list_products', 'view_product', 'search_products'],
    roles: ['merchant', 'merchant-amazon', 'merchant-flipkart'],
    effect: 'allow',
    enabled: true,
    priority: 100,
    tags: ['products', 'merchant', 'read'],
  },

  {
    name: 'Merchant - Manage Own Products',
    description: 'Allow merchant users to create and update their own products',
    actions: ['create_product', 'update_product', 'manage_inventory'],
    roles: ['merchant', 'merchant-amazon', 'merchant-flipkart'],
    effect: 'allow',
    enabled: true,
    priority: 100,
    tags: ['products', 'merchant', 'write'],
  },

  {
    name: 'Merchant - Cannot Delete Products',
    description: 'Deny merchants from deleting products (admin only)',
    actions: ['delete_product'],
    roles: ['merchant', 'merchant-amazon', 'merchant-flipkart'],
    effect: 'deny',
    enabled: true,
    priority: 200,
    tags: ['products', 'merchant', 'write'],
  },

  {
    name: 'Merchant - View Orders',
    description: 'Allow merchant users to view orders (for their product fulfillment)',
    actions: ['view_order', 'view_orders'],
    roles: ['merchant', 'merchant-amazon', 'merchant-flipkart'],
    effect: 'allow',
    enabled: true,
    priority: 100,
    tags: ['orders', 'merchant', 'read'],
  },

  {
    name: 'Merchant - Cannot Manage Users',
    description: 'Deny merchant users from accessing user management',
    actions: ['view_users', 'manage_users', 'approve_user', 'reject_user'],
    roles: ['merchant', 'merchant-amazon', 'merchant-flipkart'],
    effect: 'deny',
    enabled: true,
    priority: 200,
    tags: ['users', 'merchant', 'restriction'],
  },

  // ============================================================================
  // CART & CHECKOUT POLICIES
  // ============================================================================

  {
    name: 'Guest - Cannot Add to Cart',
    description: 'Deny guest users from adding items to cart',
    actions: ['add_to_cart', 'remove_from_cart', 'checkout'],
    roles: ['guest'],
    effect: 'deny',
    enabled: true,
    priority: 200,
    tags: ['cart', 'guest', 'write'],
  },

  {
    name: 'User - Add to Cart',
    description: 'Allow authenticated users to add items to cart',
    actions: ['add_to_cart', 'remove_from_cart', 'view_cart', 'clear_cart'],
    roles: ['user'],
    effect: 'allow',
    conditions: [
      {
        field: 'resource.status',
        operator: 'equals',
        value: 'active',
      },
    ],
    enabled: true,
    priority: 100,
    tags: ['cart', 'user', 'write'],
  },

  {
    name: 'User - Checkout',
    description: 'Allow authenticated users to create orders (checkout)',
    actions: ['checkout', 'create_order'],
    roles: ['user'],
    effect: 'allow',
    enabled: true,
    priority: 100,
    tags: ['orders', 'user', 'write'],
  },

  // ============================================================================
  // ORDER MANAGEMENT POLICIES
  // ============================================================================

  {
    name: 'User - View Own Orders',
    description: 'Allow users to view their own orders only',
    actions: ['view_order', 'view_orders'],
    roles: ['user'],
    effect: 'allow',
    conditions: [
      {
        field: 'resource.userId',
        operator: 'equals',
        value: 'userId', // Placeholder - actual userId from context
      },
    ],
    enabled: true,
    priority: 100,
    tags: ['orders', 'user', 'read'],
  },

  {
    name: 'Admin - View All Orders',
    description: 'Allow admin users to view all orders',
    actions: ['view_order', 'view_orders', 'manage_orders'],
    roles: ['admin'],
    effect: 'allow',
    enabled: true,
    priority: 100,
    tags: ['orders', 'admin', 'read', 'write'],
  },

  {
    name: 'Guest - Cannot View Orders',
    description: 'Deny guest users from viewing orders',
    actions: ['view_order', 'view_orders'],
    roles: ['guest'],
    effect: 'deny',
    enabled: true,
    priority: 200,
    tags: ['orders', 'guest', 'read'],
  },

  // ============================================================================
  // AUTHENTICATION POLICIES
  // ============================================================================

  {
    name: 'Public - Login and Registration',
    description: 'Allow public access to login and registration endpoints',
    actions: ['login', 'signup', 'forgot_password'],
    roles: [], // Applies to all roles including guest
    effect: 'allow',
    enabled: true,
    priority: 100,
    tags: ['auth', 'public'],
  },

  {
    name: 'User - Access Profile',
    description: 'Allow authenticated users to view their own profile',
    actions: ['view_profile', 'update_profile'],
    roles: ['user', 'admin'],
    effect: 'allow',
    enabled: true,
    priority: 100,
    tags: ['auth', 'profile'],
  },

  // ============================================================================
  // POLICY MANAGEMENT POLICIES
  // ============================================================================

  {
    name: 'Admin - Manage Policies',
    description: 'Allow admin users to create, read, update, and delete policies',
    actions: [
      'list_policies',
      'view_policy',
      'create_policy',
      'update_policy',
      'delete_policy',
      'enable_policy',
      'disable_policy',
    ],
    roles: ['admin'],
    effect: 'allow',
    enabled: true,
    priority: 100,
    tags: ['policies', 'admin', 'write'],
  },

  {
    name: 'Deny - Non-Admin Manage Policies',
    description: 'Deny non-admin users from managing policies',
    actions: [
      'create_policy',
      'update_policy',
      'delete_policy',
      'enable_policy',
      'disable_policy',
    ],
    roles: ['guest', 'user'],
    effect: 'deny',
    enabled: true,
    priority: 200,
    tags: ['policies', 'user', 'write'],
  },

  {
    name: 'Admin - View All Policies',
    description: 'Allow admin to view all policies for auditing',
    actions: ['list_policies', 'view_policy'],
    roles: ['admin'],
    effect: 'allow',
    enabled: true,
    priority: 100,
    tags: ['policies', 'admin', 'read'],
  },

  // ============================================================================
  // SEARCH & FILTERING
  // ============================================================================

  {
    name: 'Guest - Search Active Products Only',
    description: 'When guest searches products, only show active ones',
    actions: ['search_products'],
    roles: ['guest'],
    effect: 'allow',
    conditions: [
      {
        field: 'filters.status',
        operator: 'in',
        value: ['active'],
      },
    ],
    enabled: true,
    priority: 100,
    tags: ['search', 'guest', 'filter'],
  },

  // ============================================================================
  // TIME-BASED RESTRICTIONS (Examples)
  // ============================================================================

  {
    name: 'Limited Availability - Early Access',
    description: 'Allow users with early_access tag to see limited products',
    actions: ['view_product'],
    roles: [],
    effect: 'allow',
    conditions: [
      {
        field: 'resource.status',
        operator: 'equals',
        value: 'limited',
      },
      {
        field: 'user.tags',
        operator: 'in',
        value: ['early_access'],
      },
    ],
    enabled: true,
    priority: 150,
    tags: ['products', 'time-limited', 'special'],
  },

  // ============================================================================
  // DEFAULT RULES
  // ============================================================================

  {
    name: 'Default Deny - Fallback',
    description: 'Default deny policy for any unspecified action (fail secure)',
    actions: [], // Applies to all actions not explicitly allowed
    roles: ['guest'],
    effect: 'deny',
    enabled: true,
    priority: 0, // Lowest priority = evaluated last
    tags: ['default', 'security'],
  },
];

export default defaultPolicies;
