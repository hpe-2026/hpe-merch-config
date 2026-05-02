// Cucumber.js hooks for setup and teardown

export const Before = function() {
  // Initialize test environment before each scenario
  console.log('Setting up test scenario...');
};

export const After = function() {
  // Clean up after each scenario
  console.log('Tearing down test scenario...');
  // Clear localStorage
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  }
};

export const BeforeAll = function() {
  console.log('Starting test suite...');
};

export const AfterAll = function() {
  console.log('Test suite completed');
};
