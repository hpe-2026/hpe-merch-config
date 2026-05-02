export default {
  default: {
    import: ['features/step_definitions/**/*.js'],
    format: ['progress-bar', '@cucumber/pretty-formatter'],
    formatOptions: { theme: { 'failed step': ['red', 'bold'] } },
    paths: ['features/**/*.feature'],
    worldParameters: {
      apiUrl: process.env.API_URL || 'http://localhost:3000/api/v1'
    },
    timeout: 10000,
    retry: 0
  }
};
