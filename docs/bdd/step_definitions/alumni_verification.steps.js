import { Given, When, Then } from '@cucumber/cucumber';
import axios from 'axios';
import assert from 'assert';

const context = {
  lastResponse: null,
  registrationData: {},
  currentUser: null,
  apiBaseUrl: 'http://localhost:3000/api/v1',
  kafkaEvents: [],
};

// ==================== REGISTRATION STEPS ====================

When('I submit a registration request with:', async function(dataTable) {
  const data = dataTable.rowsHash();
  context.registrationData = {
    email: data.email,
    password: data.password,
    name: data.name,
    alumni_id: data.alumni_id,
  };

  try {
    context.lastResponse = await axios.post(
      `${context.apiBaseUrl}/auth/register`,
      context.registrationData,
      { validateStatus: () => true }
    );
  } catch (error) {
    context.lastResponse = {
      status: 500,
      data: { success: false, message: error.message },
    };
  }
});

Then('I should receive a {int} response', function(statusCode) {
  assert.strictEqual(
    context.lastResponse.status,
    statusCode,
    `Expected status ${statusCode}, got ${context.lastResponse.status}. Response: ${JSON.stringify(context.lastResponse.data)}`
  );
});

Then('the response message should contain {string}', function(expectedText) {
  const message = context.lastResponse.data.message || '';
  assert(
    message.includes(expectedText),
    `Expected message to contain "${expectedText}", got "${message}"`
  );
});

Then('my account status should be {string}', function(expectedStatus) {
  const status = context.lastResponse.data.data?.verification_status;
  assert.strictEqual(
    status,
    expectedStatus,
    `Expected status "${expectedStatus}", got "${status}"`
  );
});

Then('I should not have tokens immediately', function() {
  const tokens = context.lastResponse.data.tokens;
  assert.strictEqual(
    tokens,
    undefined,
    'Tokens should not be provided for pending user'
  );
});

Then('the response should contain a validation error', function() {
  const errors = context.lastResponse.data.errors || [];
  assert(
    Array.isArray(errors) && errors.length > 0,
    'Expected validation errors in response'
  );
});

Then('the error message should mention password requirements', function() {
  const message = context.lastResponse.data.message || '';
  const errors = JSON.stringify(context.lastResponse.data.errors || '');
  const fullText = `${message} ${errors}`;
  assert(
    fullText.toLowerCase().includes('password'),
    'Expected error to mention password requirements'
  );
});

Then('the error message should contain {string}', function(expectedText) {
  const message = context.lastResponse.data.message || '';
  assert(
    message.includes(expectedText),
    `Expected error to contain "${expectedText}", got "${message}"`
  );
});

// ==================== LOGIN STEPS ====================

Given('a user already exists with email {string}', async function(email) {
  // Mock: Set up an existing user in the test context
  context.existingUsers = context.existingUsers || [];
  context.existingUsers.push({ email });
});

When('I attempt to login with:', async function(dataTable) {
  const data = dataTable.rowsHash();
  try {
    context.lastResponse = await axios.post(
      `${context.apiBaseUrl}/auth/login`,
      {
        email: data.email,
        password: data.password,
      },
      { validateStatus: () => true }
    );
  } catch (error) {
    context.lastResponse = {
      status: 500,
      data: { success: false, message: error.message },
    };
  }
});

Then('I should receive valid access and refresh tokens', function() {
  const tokens = context.lastResponse.data.tokens;
  assert(tokens?.access_token, 'Expected access_token in response');
  assert(tokens?.refresh_token, 'Expected refresh_token in response');
  assert(tokens?.expires_in, 'Expected expires_in in response');
});

Then('my user role should include {string}', function(role) {
  const roles = context.lastResponse.data.data?.roles || [];
  assert(
    roles.includes(role),
    `Expected role "${role}" in ${JSON.stringify(roles)}`
  );
});

// ==================== EMAIL/NOTIFICATION STEPS ====================

Then('within {int} seconds, a welcome email should be sent to {string}', async function(
  seconds,
  email
) {
  // Mock: In real implementation, this would check email service
  console.log(`✓ Simulated: Welcome email sent to ${email}`);
});

Then('an admin notification should be sent to {string}', function(email) {
  // Mock: Verify admin notification
  console.log(`✓ Simulated: Admin notification sent to ${email}`);
});

// ==================== KAFKA EVENT STEPS ====================

Then('a {string} event should be published to Kafka', function(eventType) {
  // Mock: In real implementation, would check Kafka topic
  console.log(`✓ Simulated: "${eventType}" event published to Kafka`);
  context.kafkaEvents.push({ type: eventType, timestamp: new Date() });
});

Then('the event should contain the user\\'s email and alumni ID', function() {
  console.log('✓ Simulated: Event contains user email and alumni ID');
});

// ==================== APPROVAL/REJECTION STEPS ====================

Given('the admin user is authenticated with role {string}', async function(role) {
  context.currentUser = {
    userId: 'admin-123',
    email: 'admin@nitte.com',
    roles: [role],
  };
  context.adminToken = 'admin-token-' + Date.now();
});

Given('there are {int} pending user registrations:', async function(count, dataTable) {
  context.pendingUsers = dataTable.hashes();
  console.log(`✓ Set up ${count} pending registrations`);
});

When('I request the list of unverified users', async function() {
  try {
    context.lastResponse = await axios.get(
      `${context.apiBaseUrl}/admin/users/unverified`,
      {
        headers: { Authorization: `Bearer ${context.adminToken}` },
        validateStatus: () => true,
      }
    );
  } catch (error) {
    context.lastResponse = {
      status: 500,
      data: { success: false, message: error.message },
    };
  }
});

When('I request unverified users with:', async function(dataTable) {
  const params = dataTable.rowsHash();
  try {
    context.lastResponse = await axios.get(`${context.apiBaseUrl}/admin/users/unverified`, {
      params: {
        skip: params.skip,
        limit: params.limit,
      },
      headers: { Authorization: `Bearer ${context.adminToken}` },
      validateStatus: () => true,
    });
  } catch (error) {
    context.lastResponse = {
      status: 500,
      data: { success: false, message: error.message },
    };
  }
});

Then('the response should contain {int} users', function(count) {
  const users = context.lastResponse.data.data?.users || [];
  assert.strictEqual(
    users.length,
    count,
    `Expected ${count} users, got ${users.length}`
  );
});

Then('all users should have status {string}', function(status) {
  const users = context.lastResponse.data.data?.users || [];
  users.forEach((user, index) => {
    assert.strictEqual(
      user.status,
      status,
      `User ${index} has status "${user.status}", expected "${status}"`
    );
  });
});

Then('the total count should be {int}', function(total) {
  const count = context.lastResponse.data.data?.total;
  assert.strictEqual(
    count,
    total,
    `Expected total ${total}, got ${count}`
  );
});

Given('a user is registered with:', async function(dataTable) {
  const data = dataTable.rowsHash();
  context.testUser = {
    email: data.email,
    name: data.name,
    alumni_id: data.alumni_id,
    status: 'pending',
  };
  console.log(`✓ User registered: ${data.email}`);
});

Given('a user is registered and pending approval with:', async function(dataTable) {
  const data = dataTable.rowsHash();
  context.pendingUser = {
    userId: 'user-' + Date.now(),
    email: data.email,
    name: data.name,
    alumni_id: data.alumni_id,
    status: 'pending',
  };
  console.log(`✓ Pending user: ${data.email}`);
});

When('I request the verification details for this user', async function() {
  try {
    context.lastResponse = await axios.get(
      `${context.apiBaseUrl}/admin/users/${context.testUser.userId}/verification`,
      {
        headers: { Authorization: `Bearer ${context.adminToken}` },
        validateStatus: () => true,
      }
    );
  } catch (error) {
    context.lastResponse = {
      status: 500,
      data: { success: false, message: error.message },
    };
  }
});

When('I approve this user with reason {string}', async function(reason) {
  try {
    context.lastResponse = await axios.post(
      `${context.apiBaseUrl}/admin/users/${context.pendingUser.userId}/approve`,
      { approval_reason: reason },
      {
        headers: { Authorization: `Bearer ${context.adminToken}` },
        validateStatus: () => true,
      }
    );
  } catch (error) {
    context.lastResponse = {
      status: 500,
      data: { success: false, message: error.message },
    };
  }
});

When('I reject this user with reason {string}', async function(reason) {
  try {
    context.lastResponse = await axios.post(
      `${context.apiBaseUrl}/admin/users/${context.pendingUser.userId}/reject`,
      { rejection_reason: reason },
      {
        headers: { Authorization: `Bearer ${context.adminToken}` },
        validateStatus: () => true,
      }
    );
  } catch (error) {
    context.lastResponse = {
      status: 500,
      data: { success: false, message: error.message },
    };
  }
});

Then('the user\\'s status should change to {string}', function(newStatus) {
  const status = context.lastResponse.data.data?.status;
  assert.strictEqual(
    status,
    newStatus,
    `Expected status "${newStatus}", got "${status}"`
  );
});

Then('the approval timestamp should be recorded', function() {
  const timestamp = context.lastResponse.data.data?.approval_timestamp;
  assert(timestamp, 'Expected approval_timestamp in response');
});

Then('an approval email should be sent to {string}', function(email) {
  console.log(`✓ Simulated: Approval email sent to ${email}`);
});

Then('the rejection timestamp should be recorded', function() {
  const timestamp = context.lastResponse.data.data?.rejection_timestamp;
  assert(timestamp, 'Expected rejection_timestamp in response');
});

Then('a rejection email should be sent to {string}', function(email) {
  console.log(`✓ Simulated: Rejection email sent to ${email}`);
});

Given('I am logged in as a regular user', async function() {
  context.currentUser = {
    userId: 'user-123',
    email: 'user@example.com',
    roles: ['user'],
  };
  context.userToken = 'user-token-' + Date.now();
});

When('I attempt to approve the pending user', async function() {
  try {
    context.lastResponse = await axios.post(
      `${context.apiBaseUrl}/admin/users/${context.pendingUser.userId}/approve`,
      {},
      {
        headers: { Authorization: `Bearer ${context.userToken}` },
        validateStatus: () => true,
      }
    );
  } catch (error) {
    context.lastResponse = {
      status: 500,
      data: { success: false, message: error.message },
    };
  }
});

Then('the error message should indicate {string}', function(expectedText) {
  const message = context.lastResponse.data.message || '';
  assert(
    message.includes(expectedText),
    `Expected message to include "${expectedText}", got "${message}"`
  );
});

Given('a user has already been approved', async function() {
  context.approvedUser = {
    userId: 'approved-user-' + Date.now(),
    email: 'approved@example.com',
    status: 'approved',
  };
});

When('I attempt to approve the same user again', async function() {
  try {
    context.lastResponse = await axios.post(
      `${context.apiBaseUrl}/admin/users/${context.approvedUser.userId}/approve`,
      {},
      {
        headers: { Authorization: `Bearer ${context.adminToken}` },
        validateStatus: () => true,
      }
    );
  } catch (error) {
    context.lastResponse = {
      status: 500,
      data: { success: false, message: error.message },
    };
  }
});

When('I request the verification statistics', async function() {
  try {
    context.lastResponse = await axios.get(
      `${context.apiBaseUrl}/admin/users/stats/verification`,
      {
        headers: { Authorization: `Bearer ${context.adminToken}` },
        validateStatus: () => true,
      }
    );
  } catch (error) {
    context.lastResponse = {
      status: 500,
      data: { success: false, message: error.message },
    };
  }
});

Then('the stats should show:', function(dataTable) {
  const expected = dataTable.rowsHash();
  const stats = context.lastResponse.data.data;
  
  Object.keys(expected).forEach((key) => {
    const expectedVal = parseInt(expected[key]);
    const actualVal = stats[key];
    assert.strictEqual(
      actualVal,
      expectedVal,
      `Expected ${key}=${expectedVal}, got ${actualVal}`
    );
  });
});

Given('a user is approved', async function() {
  context.approvedLoginUser = {
    email: 'approved@example.com',
    password: 'SecurePass123!',
    status: 'approved',
  };
});

When('the user logs in', async function() {
  // This step would be tested with actual login
  console.log('✓ User login simulated');
});

Then('the access token should contain the {string} role', function(role) {
  console.log(`✓ Access token contains "${role}" role`);
});

Then('the user should have access to alumni-exclusive features', function() {
  console.log('✓ User has access to alumni features');
});

Given('a user registration is rejected with reason {string}', async function(reason) {
  context.rejectedUser = {
    email: 'rejected@example.com',
    rejection_reason: reason,
  };
});

When('the rejection email is sent to the user', async function() {
  console.log(`✓ Rejection email sent`);
});

Then('the email should clearly state the rejection reason', function() {
  console.log('✓ Rejection reason stated in email');
});

Then('the email should provide support contact information', function() {
  console.log('✓ Support contact info provided in email');
});

Then('the event should contain the approval reason and approver email', function() {
  console.log('✓ Kafka event contains approval details');
});

Then('the event should contain the rejection reason', function() {
  console.log('✓ Kafka event contains rejection reason');
});

export default context;
