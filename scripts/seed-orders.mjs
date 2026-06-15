#!/usr/bin/env node
/**
 * Seed Orders Script — Creates orders across all 4 regions
 * to demonstrate MongoDB sharding (south/west → Shard1, north/east → Shard2)
 * 
 * Usage: node scripts/seed-orders.mjs
 */

import http from 'http';

const KEYCLOAK_URL = process.env.KEYCLOAK_URL || 'http://keycloak:8080';
const API_URL = process.env.API_URL || 'http://localhost:3000';
const USERNAME = 'radheshpai716@gmail.com';
const PASSWORD = 'radhesh@123';

// Orders to create — 2 per region for a good distribution
const ORDERS = [
  {
    region: 'south',
    shipping_address: '123, MG Road, Mangalore, Karnataka 575001',
    items: [{ product_id: '6a2fe31a94c8ef432246d326', quantity: 2 }],
    notes: 'Ship to Mangalore campus'
  },
  {
    region: 'south',
    shipping_address: '45, Brigade Road, Bangalore, Karnataka 560001',
    items: [{ product_id: '6a2fe31b94c8ef432246d327', quantity: 1 }, { product_id: '6a2fe31b94c8ef432246d328', quantity: 3 }],
    notes: 'Bangalore delivery'
  },
  {
    region: 'west',
    shipping_address: '78, Marine Drive, Mumbai, Maharashtra 400002',
    items: [{ product_id: '6a2fe31b94c8ef432246d329', quantity: 5 }],
    notes: 'Mumbai office address'
  },
  {
    region: 'west',
    shipping_address: '12, FC Road, Pune, Maharashtra 411004',
    items: [{ product_id: '6a2fe31a94c8ef432246d326', quantity: 1 }, { product_id: '6a2fe31b94c8ef432246d329', quantity: 2 }],
    notes: 'Pune branch delivery'
  },
  {
    region: 'north',
    shipping_address: '56, Connaught Place, New Delhi 110001',
    items: [{ product_id: '6a2fe31b94c8ef432246d327', quantity: 3 }],
    notes: 'Delhi head office'
  },
  {
    region: 'north',
    shipping_address: '89, Mall Road, Chandigarh 160017',
    items: [{ product_id: '6a2fe31b94c8ef432246d328', quantity: 2 }, { product_id: '6a2fe31a94c8ef432246d326', quantity: 1 }],
    notes: 'Chandigarh alumni meetup'
  },
  {
    region: 'east',
    shipping_address: '34, Park Street, Kolkata, West Bengal 700016',
    items: [{ product_id: '6a2fe31b94c8ef432246d327', quantity: 2 }],
    notes: 'Kolkata chapter event'
  },
  {
    region: 'east',
    shipping_address: '67, Janpath, Bhubaneswar, Odisha 751001',
    items: [{ product_id: '6a2fe31a94c8ef432246d326', quantity: 1 }, { product_id: '6a2fe31b94c8ef432246d328', quantity: 4 }],
    notes: 'Bhubaneswar alumni gathering'
  },
];

function httpRequest(url, method, headers, body) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const opts = {
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method,
      headers,
    };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function getToken() {
  console.log('Authenticating with Keycloak...');
  const body = `grant_type=password&client_id=nitte-client&client_secret=nitte-client-secret&username=${encodeURIComponent(USERNAME)}&password=${encodeURIComponent(PASSWORD)}`;
  const res = await httpRequest(
    `${KEYCLOAK_URL}/realms/nitte-realm/protocol/openid-connect/token`,
    'POST',
    { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
    body
  );
  if (res.data.access_token) {
    console.log(`✓ Authenticated as ${USERNAME}\n`);
    return res.data.access_token;
  }
  throw new Error(`Auth failed: ${JSON.stringify(res.data).substring(0, 200)}`);
}

async function createOrder(token, order, index) {
  const body = JSON.stringify(order);
  const res = await httpRequest(
    `${API_URL}/api/v1/orders`,
    'POST',
    {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'Content-Length': Buffer.byteLength(body),
    },
    body
  );
  
  if (res.status === 201 || res.status === 200) {
    const orderId = res.data?.data?.order_id || res.data?.data?._id || 'unknown';
    console.log(`  [${index + 1}/8] ✓ ${order.region.toUpperCase().padEnd(5)} | ${order.shipping_address.split(',')[1]?.trim() || order.shipping_address.substring(0, 20)} | Order: ${orderId}`);
    return true;
  } else {
    console.log(`  [${index + 1}/8] ✗ ${order.region.toUpperCase().padEnd(5)} | Status ${res.status}: ${JSON.stringify(res.data).substring(0, 150)}`);
    return false;
  }
}

async function main() {
  console.log('========================================');
  console.log('  Order Seeding — MongoDB Sharding Demo');
  console.log('========================================\n');
  console.log('Shard 1 (SOUTH_WEST): south, west regions');
  console.log('Shard 2 (NORTH_EAST): north, east regions\n');

  const token = await getToken();

  console.log('Creating orders across all regions...\n');
  
  let success = 0;
  for (let i = 0; i < ORDERS.length; i++) {
    const ok = await createOrder(token, ORDERS[i], i);
    if (ok) success++;
  }

  console.log(`\n========================================`);
  console.log(`  Results: ${success}/${ORDERS.length} orders created`);
  console.log(`========================================`);
  console.log(`  south: 2 orders → Shard 1`);
  console.log(`  west:  2 orders → Shard 1`);
  console.log(`  north: 2 orders → Shard 2`);
  console.log(`  east:  2 orders → Shard 2`);
  console.log(`========================================\n`);
  
  console.log('Verify shard distribution:');
  console.log('  docker exec nitte-mongodb mongosh --eval "db.getSiblingDB(\'nitte_merch\').orders.getShardDistribution()"');
  console.log('');
}

main().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
