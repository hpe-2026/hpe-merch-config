/**
 * Sync Keycloak users to MongoDB
 * Ensures all Keycloak users have records in MongoDB for data persistence
 */

import axios from 'axios';
import UserVerification from '../schemas/userVerification.js';
import logger from '../config/logger.js';

const KEYCLOAK_SERVER = process.env.KEYCLOAK_SERVER_URL || 'http://keycloak:8080';
const KEYCLOAK_REALM = process.env.KEYCLOAK_REALM || 'nitte-realm';
const KEYCLOAK_ADMIN = process.env.KEYCLOAK_ADMIN || 'admin';
const KEYCLOAK_ADMIN_PASSWORD = process.env.KEYCLOAK_ADMIN_PASSWORD || 'admin';

/**
 * Get admin token from Keycloak
 */
async function getAdminToken() {
  const response = await axios.post(
    `${KEYCLOAK_SERVER}/realms/master/protocol/openid-connect/token`,
    new URLSearchParams({
      grant_type: 'password',
      client_id: 'admin-cli',
      username: KEYCLOAK_ADMIN,
      password: KEYCLOAK_ADMIN_PASSWORD,
    }),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    }
  );
  return response.data.access_token;
}

/**
 * Get all users from Keycloak
 */
async function getKeycloakUsers(token) {
  const response = await axios.get(
    `${KEYCLOAK_SERVER}/admin/realms/${KEYCLOAK_REALM}/users?max=1000`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  return response.data;
}

/**
 * Get user roles from Keycloak
 */
async function getUserRoles(token, userId) {
  try {
    const response = await axios.get(
      `${KEYCLOAK_SERVER}/admin/realms/${KEYCLOAK_REALM}/users/${userId}/role-mappings/realm`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    return response.data.map(r => r.name);
  } catch (error) {
    return [];
  }
}

/**
 * Determine user type from roles
 */
function getUserType(roles) {
  if (roles.includes('platform-admin') || roles.includes('admin') || roles.includes('super-admin')) {
    return 'admin';
  }
  if (roles.includes('merchant-admin') || roles.includes('merchant') || roles.includes('merchant-amazon') || roles.includes('merchant-flipkart')) {
    return 'merchant';
  }
  if (roles.includes('admin-internal') || roles.includes('internal-user')) {
    return 'internal';
  }
  if (roles.includes('alumni-verified') || roles.includes('alumni')) {
    return 'alumni';
  }
  return 'non_alumni';
}

/**
 * Sync all Keycloak users to MongoDB
 */
async function syncKeycloakUsers() {
  try {
    logger.info('Starting Keycloak to MongoDB sync...');

    // Get admin token
    const token = await getAdminToken();
    logger.info('Got Keycloak admin token');

    // Get all Keycloak users
    const users = await getKeycloakUsers(token);
    logger.info(`Found ${users.length} users in Keycloak`);

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const user of users) {
      // Skip service accounts
      if (user.username.startsWith('service-account-')) {
        skipped++;
        continue;
      }

      const email = user.email || user.username;
      if (!email) {
        skipped++;
        continue;
      }

      // Get user roles
      const roles = await getUserRoles(token, user.id);
      const userType = getUserType(roles);

      // Check if user exists in MongoDB
      let existing = await UserVerification.findOne({ email: email.toLowerCase() });

      if (!existing) {
        // Create new record
        const newUser = new UserVerification({
          user_id: user.id,
          email: email.toLowerCase(),
          name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || email.split('@')[0],
          status: 'approved',
          user_type: userType,
          approved_by: 'keycloak-sync-script',
          approval_timestamp: new Date(),
          registration_timestamp: new Date(user.createdTimestamp || Date.now()),
        });
        await newUser.save();
        created++;
        logger.info(`Created MongoDB record for ${email} (${userType})`);
      } else {
        // Update existing record with Keycloak ID if missing
        if (!existing.user_id) {
          existing.user_id = user.id;
          existing.user_type = userType;
          await existing.save();
          updated++;
          logger.info(`Updated MongoDB record for ${email}`);
        }
      }
    }

    logger.info(`Sync complete: ${created} created, ${updated} updated, ${skipped} skipped`);
    return { created, updated, skipped, total: users.length };
  } catch (error) {
    logger.error('Keycloak sync failed:', error.message);
    throw error;
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  syncKeycloakUsers()
    .then((result) => {
      console.log('Sync completed:', result);
      process.exit(0);
    })
    .catch((error) => {
      console.error('Sync failed:', error);
      process.exit(1);
    });
}

export default syncKeycloakUsers;
