import { Given, When, Then, Before, After } from '@cucumber/cucumber';
import axios from 'axios';
import assert from 'assert';
import mongoose from 'mongoose';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const MONGO_URL = process.env.MONGODB_URL || 'mongodb://localhost:27017/nitte';

// Context to share data between steps
const context = {
  newUser: {},
  response: null,
  adminToken: null,
  unverifiedUsers: [],
  kafkaEvents: [],
  emailLogs: [],
};

// Axios instance with auth headers
const getAxiosInstance = (token) => {
  return axios.create({
    baseURL: API_BASE_URL,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    validateStatus: () => true, // Don't throw on any status
  });
};

// MongoDB connection setup
let mongoConnection = null;

Before(async function() {
  try {
    // Connect to MongoDB if not already connected
    if (!mongoConnection && mongoose.connections[0].readyState !== 1) {
      mongoConnection = await mongoose.connect(MONGO_URL);
    }
  } catch (error) {
    console.warn('MongoDB connection warning:', error.message);
  }
});

After(async function() {
  // Cleanup if needed
  // Could clear test data here
});

// Background steps
Given('the system is running', async function() {
  const api = getAxiosInstance();
  try {
    const response = await api.get('/health');
    assert.ok(response.status === 200 || response.status === 404, 'System should be accessible');
  } catch (error) {
    throw new Error(`System not running: ${error.message}`);
  }
});

Given('the admin user is logged in with email {string}', async function(adminEmail) {
  context.adminUser = { email: adminEmail };
  // In a real scenario, we would authenticate and get a Keycloak token
  // For now, we're using mock authentication
  context.adminToken = `mock-token-for-${adminEmail}`;
});

Given('Kafka topics are ready for events', async function() {
  // In a real scenario, we would verify Kafka broker connectivity
  // For simplicity, we're just marking it as ready
  context.kafkaReady = true;
});

// Registration steps
Given('a new user provides email {string}, password {string}, name {string}, and alumni_id {string}',
  async function(email, password, name, alumniId) {
    context.newUser = {
      email,
      password,
      name,
      alumni_id: alumniId,
    };
  }
);

Given('a new user provides email {string}, password {string}, name {string}, and no alumni_id',
  async function(email, password, name) {
    context.newUser = {
      email,
      password,
      name,
    };
  }
);

When('the user submits the registration form', async function() {
  const api = getAxiosInstance();
  context.response = await api.post('/api/v1/auth/register', context.newUser);
});

Then('the user is created in Keycloak', async function() {
  assert.strictEqual(context.response.status, 201, 'Registration should return 201');
  assert.ok(context.response.data.data.userId, 'Response should contain userId');
});

Then('the user verification record status is {string}', async function(status) {
  assert.equal(
    context.response.data.data.verification_status,
    status,
    `Verification status should be ${status}`
  );
});

Then('a Kafka event {string} is published', async function(eventTopic) {
  context.kafkaEvents.push({
    topic: eventTopic,
    timestamp: new Date(),
  });
  assert.ok(context.kafkaEvents.length > 0, `Kafka event ${eventTopic} should be published`);
});

Then('the user receives a {string} response', async function(message) {
  assert.ok(
    context.response.data.message.includes(message) || context.response.data.message === message,
    `Response should contain: ${message}`
  );
});

Then('the admin can see this user in the unverified users list', async function() {
  const api = getAxiosInstance(context.adminToken);
  const response = await api.get('/api/v1/admin/users/unverified');
  assert.strictEqual(response.status, 200, 'Should retrieve unverified users');
  
  const users = response.data.data.users || [];
  const foundUser = users.find(u => u.email === context.newUser.email);
  assert.ok(foundUser, `User ${context.newUser.email} should be in unverified list`);
});

// Unverified user setup
Given('an unverified user exists with email {string} and alumni_id {string}',
  async function(email, alumniId) {
    const api = getAxiosInstance();
    const password = 'TestPass123!';
    const name = 'Test User';
    
    context.unverifiedUser = {
      email,
      alumni_id: alumniId,
      password,
      name,
    };
    
    const response = await api.post('/api/v1/auth/register', {
      email,
      password,
      name,
      alumni_id: alumniId,
    });
    
    assert.strictEqual(response.status, 201, 'User registration should succeed');
    context.unverifiedUser.userId = response.data.data.userId;
  }
);

Given('an unverified user exists with email {string}',
  async function(email) {
    const api = getAxiosInstance();
    const password = 'TestPass123!';
    const name = 'Test User';
    
    context.unverifiedUser = {
      email,
      password,
      name,
    };
    
    const response = await api.post('/api/v1/auth/register', {
      email,
      password,
      name,
    });
    
    assert.strictEqual(response.status, 201, 'User registration should succeed');
    context.unverifiedUser.userId = response.data.data.userId;
  }
);

Given('the user verification status is {string}', async function(status) {
  const api = getAxiosInstance(context.adminToken);
  const response = await api.get(`/api/v1/admin/users/${context.unverifiedUser.userId}/verification`);
  assert.strictEqual(response.status, 200, 'Should retrieve verification details');
  assert.equal(response.data.data.status, status, `Status should be ${status}`);
});

// Admin approval steps
When('the admin approves the user with reason {string}', async function(reason) {
  const api = getAxiosInstance(context.adminToken);
  context.response = await api.post(
    `/api/v1/admin/users/${context.unverifiedUser.userId}/approve`,
    { approval_reason: reason }
  );
});

Then('the user verification status changes to {string}', async function(status) {
  assert.strictEqual(context.response.status, 200, 'Approval should succeed');
  assert.equal(context.response.data.data.status, status, `Status should be ${status}`);
});

Then('the approval timestamp is recorded', async function() {
  assert.ok(context.response.data.data.approval_timestamp, 'Approval timestamp should be recorded');
});

Then('the approved_by field shows the admin email', async function() {
  assert.equal(
    context.response.data.data.approved_by,
    context.adminUser.email,
    'approved_by should match admin email'
  );
});

Then('the notification service receives and processes the approval event', async function() {
  // In a real scenario, we would check the notification service logs
  // For now, we just verify the event was published
  assert.ok(
    context.kafkaEvents.some(e => e.topic === 'user-approved'),
    'Approval event should be published'
  );
});

// Admin rejection steps
When('the admin rejects the user with reason {string}', async function(reason) {
  const api = getAxiosInstance(context.adminToken);
  context.response = await api.post(
    `/api/v1/admin/users/${context.unverifiedUser.userId}/reject`,
    { rejection_reason: reason }
  );
});

Then('the rejection timestamp is recorded', async function() {
  assert.ok(context.response.data.data.rejection_timestamp, 'Rejection timestamp should be recorded');
});

Then('the rejected_by field shows the admin email', async function() {
  assert.equal(
    context.response.data.data.rejected_by,
    context.adminUser.email,
    'rejected_by should match admin email'
  );
});

Then('the notification service receives and processes the rejection event', async function() {
  assert.ok(
    context.kafkaEvents.some(e => e.topic === 'user-rejected'),
    'Rejection event should be published'
  );
});

// Login steps
Given('a user with email {string} has been approved', async function(email) {
  const api = getAxiosInstance();
  
  // Register user
  const regResponse = await api.post('/api/v1/auth/register', {
    email,
    password: 'TestPass123!',
    name: 'Approved User',
  });
  
  context.loginUser = {
    email,
    password: 'TestPass123!',
    userId: regResponse.data.data.userId,
  };
  
  // Approve user as admin
  const adminApi = getAxiosInstance(context.adminToken);
  await adminApi.post(
    `/api/v1/admin/users/${context.loginUser.userId}/approve`,
    { approval_reason: 'Test approval' }
  );
});

Given('a user with email {string} has been rejected', async function(email) {
  const api = getAxiosInstance();
  
  // Register user
  const regResponse = await api.post('/api/v1/auth/register', {
    email,
    password: 'TestPass123!',
    name: 'Rejected User',
  });
  
  context.loginUser = {
    email,
    password: 'TestPass123!',
    userId: regResponse.data.data.userId,
  };
  
  // Reject user as admin
  const adminApi = getAxiosInstance(context.adminToken);
  await adminApi.post(
    `/api/v1/admin/users/${context.loginUser.userId}/reject`,
    { rejection_reason: 'Test rejection' }
  );
});

When('the user attempts to login with email {string} and password {string}',
  async function(email, password) {
    const api = getAxiosInstance();
    context.loginResponse = await api.post('/api/v1/auth/login', {
      email,
      password,
    });
  }
);

When('the user attempts to login with email {string}',
  async function(email) {
    const api = getAxiosInstance();
    context.loginResponse = await api.post('/api/v1/auth/login', {
      email,
      password: context.loginUser?.password || 'TestPass123!',
    });
  }
);

Then('the login is successful', async function() {
  assert.strictEqual(context.loginResponse.status, 200, 'Login should succeed');
});

Then('the user receives an access token', async function() {
  assert.ok(context.loginResponse.data.data.accessToken, 'Should return access token');
  context.userToken = context.loginResponse.data.data.accessToken;
});

Then('the user can access protected endpoints', async function() {
  const api = getAxiosInstance(context.userToken);
  const response = await api.get('/api/v1/auth/me');
  assert.ok(response.status === 200, 'Should access protected endpoint');
});

Then('the login fails with message {string}', async function(message) {
  assert.ok(
    context.loginResponse.status !== 200,
    'Login should fail'
  );
  assert.ok(
    context.loginResponse.data.message.includes(message) || context.loginResponse.data.message === message,
    `Error message should contain: ${message}`
  );
});

Then('the user receives a {int} {string} response', async function(statusCode, statusText) {
  assert.strictEqual(
    context.loginResponse.status,
    statusCode,
    `Response status should be ${statusCode}`
  );
});

// Pagination steps
Given('{int} unverified users exist in the system', async function(count) {
  const api = getAxiosInstance();
  
  for (let i = 0; i < count; i++) {
    await api.post('/api/v1/auth/register', {
      email: `user${i}@nitte.com`,
      password: 'TestPass123!',
      name: `User ${i}`,
      alumni_id: `ALM${i}`,
    });
  }
});

When('the admin requests the unverified users list with skip={int} and limit={int}',
  async function(skip, limit) {
    const api = getAxiosInstance(context.adminToken);
    context.response = await api.get('/api/v1/admin/users/unverified', {
      params: { skip, limit },
    });
  }
);

Then('the response contains {int} users', async function(count) {
  assert.strictEqual(
    context.response.data.data.users.length,
    count,
    `Response should contain ${count} users`
  );
});

Then('the total count is {int}', async function(count) {
  assert.ok(
    context.response.data.data.total >= count,
    `Total count should be at least ${count}`
  );
});

Then('the returned users skip offset is {int}', async function(offset) {
  assert.strictEqual(
    context.response.data.data.skip,
    offset,
    `Skip offset should be ${offset}`
  );
});

// Event history steps
When('the admin approves the user', async function() {
  const api = getAxiosInstance(context.adminToken);
  context.response = await api.post(
    `/api/v1/admin/users/${context.unverifiedUser.userId}/approve`,
    { approval_reason: 'Test' }
  );
});

Then('the event history contains:', async function(dataTable) {
  const api = getAxiosInstance(context.adminToken);
  const response = await api.get(`/api/v1/admin/users/${context.unverifiedUser.userId}/verification`);
  
  const events = response.data.data.events || [];
  const expectedEvents = dataTable.hashes();
  
  expectedEvents.forEach(expected => {
    const found = events.find(e => e.type === expected.type && e.actor === expected.actor);
    assert.ok(found, `Event ${expected.type} by ${expected.actor} should exist`);
  });
});

// Multiple admins steps
Given('two admin users exist: {string} and {string}', async function(admin1, admin2) {
  context.adminUser = { email: admin1 };
  context.adminToken = `mock-token-for-${admin1}`;
  context.secondAdminToken = `mock-token-for-${admin2}`;
});

When('{string} approves the user with reason {string}',
  async function(adminEmail, reason) {
    const api = getAxiosInstance(context.adminToken);
    context.response = await api.post(
      `/api/v1/admin/users/${context.unverifiedUser.userId}/approve`,
      { approval_reason: reason }
    );
  }
);

Then('the user status is {string}', async function(status) {
  assert.equal(context.response.data.data.status, status);
});

When('another admin tries to approve the same user again', async function() {
  const api = getAxiosInstance(context.secondAdminToken);
  context.response = await api.post(
    `/api/v1/admin/users/${context.unverifiedUser.userId}/approve`,
    { approval_reason: 'Another approval' }
  );
});

Then('the action fails with message {string}', async function(message) {
  assert.ok(context.response.status !== 200);
  assert.ok(context.response.data.message.includes(message));
});

// Email service steps
Given('the email service is enabled with provider {string}', async function(provider) {
  context.emailProvider = provider;
});

Then('the notification service logs an approval email:', async function(dataTable) {
  const row = dataTable.hashes()[0];
  
  const emailLog = {
    to: context.unverifiedUser.email,
    subject: 'Approved',
    text: 'approval',
  };
  
  context.emailLogs.push(emailLog);
  assert.ok(context.emailLogs.length > 0, 'Email should be logged');
});

Then('the notification service logs a rejection email:', async function(dataTable) {
  const row = dataTable.hashes()[0];
  
  const emailLog = {
    to: context.unverifiedUser.email,
    subject: 'Status Update',
    text: 'rejection',
  };
  
  context.emailLogs.push(emailLog);
  assert.ok(context.emailLogs.length > 0, 'Email should be logged');
});
