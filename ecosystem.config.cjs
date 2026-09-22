module.exports = {
  apps: [
    {
      name: 'ats-backend-api',
      script: './dist/main.js',
      instances: 'max', // Scales automatically across all available CPU cores
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      listen_timeout: 10000,
      kill_timeout: 5000,
      wait_ready: true,
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      env_staging: {
        NODE_ENV: 'staging',
        PORT: 3000,
      },
    },
  ],
};
