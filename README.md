# Tensorium Pool Website

Next.js frontend for the official/reference Tensorium mining pool.

## Features

- Pool stats from `tensorium-pool`
- Miner pending-payout lookup
- Payout history with gross reward, 5% pool fee, and net payout
- Miner connection guide
- Public fee and treasury disclosure

## Environment

```bash
TENSORIUM_POOL_API_URL=http://127.0.0.1:23336
NEXT_PUBLIC_POOL_HOST=pool.tensoriumlabs.com:23336
NEXT_PUBLIC_CHAIN_NAME=Tensorium testnet / mainnet-candidate pool
```

The browser talks to this Next.js app. The app proxies local requests to the pool backend, so the pool port can stay private behind nginx.

## Development

```bash
npm install
npm run typecheck
npm run build
npm run dev
```

## VPS Deployment

```bash
git clone https://github.com/rygroup-dev/tensorium-pool-website.git /root/tensorium-pool-website
cd /root/tensorium-pool-website
npm ci
npm run build
pm2 start ecosystem.config.cjs
cp deploy/nginx-pool.tensoriumlabs.com.conf /etc/nginx/sites-available/pool.tensoriumlabs.com
ln -sf /etc/nginx/sites-available/pool.tensoriumlabs.com /etc/nginx/sites-enabled/pool.tensoriumlabs.com
nginx -t && systemctl reload nginx
certbot --nginx -d pool.tensoriumlabs.com --non-interactive --agree-tos -m admin@tensoriumlabs.com
```
