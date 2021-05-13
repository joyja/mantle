module.exports = {
  apps: [
    {
      name: 'mantle',
      script: './src/index.js',
      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
      },
    },
  ],
  deploy: {
    production: {
      user: 'ubuntu',
      host: 'mantle1.lxd',
      ref: 'origin/master',
      repo: 'https://gitlab.com/joyja/mantle.git',
      path: '/home/ubuntu/mantle',
      'post-deploy': 'npm install && pm2 startOrRestart ecosystem.config.js -- env production'
    }
  }
}
