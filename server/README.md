# pc-admin server

This directory contains the standalone backend for the current web admin product.
It keeps the frontend contract stable while moving the old cloud-function logic onto your own server.

## What it exposes

- `POST /api/admin/call`
- `POST /api/ai/call`
- `POST /api/ocr/call`
- `GET /api/health`

The frontend already knows how to call these routes when `VITE_API_BASE_URL` is configured.

## Stack

- Node.js + Express
- MySQL 8
- JWT session tokens
- Baidu OCR
- DashScope for AI Q&A / field extraction

## 1. Install

```bash
cd /home/ubuntu/apps/pc-admin/server
npm install
cp .env.example .env
```

## 2. Configure `.env`

At minimum, fill in:

- `MYSQL_HOST`
- `MYSQL_PORT`
- `MYSQL_USER`
- `MYSQL_PASSWORD`
- `MYSQL_DATABASE`
- `JWT_SECRET`
- `BAIDU_API_KEY`
- `BAIDU_SECRET_KEY`

Optional but recommended:

- `DEFAULT_ADMIN_USERNAME`
- `DEFAULT_ADMIN_PASSWORD`
- `DASHSCOPE_API_KEY`

## 3. Create the database on the cloud server

If you want the fastest path on Ubuntu with Docker:

```bash
docker run -d \
  --name pressure-mysql \
  --restart always \
  -e MYSQL_ROOT_PASSWORD=replace-root-password \
  -e MYSQL_DATABASE=pressure_admin \
  -e MYSQL_USER=pc_admin \
  -e MYSQL_PASSWORD=replace-app-password \
  -p 3306:3306 \
  mysql:8.0
```

If you prefer a package install:

```bash
sudo apt update
sudo apt install -y mysql-server
sudo systemctl enable --now mysql
```

Then create the app database and user:

```sql
CREATE DATABASE pressure_admin DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'pc_admin'@'%' IDENTIFIED BY 'replace-app-password';
GRANT ALL PRIVILEGES ON pressure_admin.* TO 'pc_admin'@'%';
FLUSH PRIVILEGES;
```

## 4. Initialize tables and default admin

```bash
npm run init-db
```

That script:

- creates all tables from `sql/schema.sql`
- creates the default admin if it does not exist
- stores the admin password as a bcrypt hash

## 5. Start the server

```bash
npm run start
```

Health check:

```bash
curl http://127.0.0.1:3001/api/health
```

Expected response:

```json
{"success":true,"message":"pc-admin server ok"}
```

## 6. Point the frontend to this server

Create a frontend `.env` or deployment variable:

```bash
VITE_API_BASE_URL=http://your-server-ip:3001
```

Then rebuild the frontend:

```bash
npm run build
```

## 7. Recommended production setup

Use Nginx as a reverse proxy and expose only ports `80/443`.
Run the Node service behind PM2 or systemd.

Example PM2 flow:

```bash
npm install -g pm2
pm2 start src/app.js --name pc-admin-server
pm2 save
pm2 startup
```

## Current scope

This backend already covers the current web product flow:

- admin login
- admin dashboard / records / enterprises
- enterprise login / register
- enterprise equipment list
- enterprise gauge list
- AI-assisted record save
- OCR relay

It does not yet recreate WeChat-only capabilities such as:

- openid binding
- WeChat subscription messages
- mini-program-specific runtime context
