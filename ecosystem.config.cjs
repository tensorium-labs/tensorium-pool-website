module.exports = {
  apps: [
    {
      name: "tensorium-pool-website",
      cwd: "/root/tensorium-pool-website",
      script: "npm",
      args: "start",
      env: {
        NODE_ENV: "production",
        PORT: "3002",
        TENSORIUM_POOL_API_URL: "http://127.0.0.1:23336",
        NEXT_PUBLIC_POOL_HOST: "pooltxm.tensoriumlabs.com:23336",
        NEXT_PUBLIC_CHAIN_NAME: "Tensorium pool"
      }
    }
  ]
};
