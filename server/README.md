# pc-admin server

这个目录是网页端对应的独立后端，目标是把原来依赖微信云函数和云开发数据库的能力迁到你自己的云服务器上。

当前已迁出的主链路：

- `webAdmin`：监管端和企业端台账读写，使用自建 MySQL
- `aiAssistant`：网页端 AI 问答、证书文本提取
- `baiduOcr`：图片 OCR

## 1. 安装

```bash
cd /home/ubuntu/apps/pc-admin/server
npm install
```

## 2. 配置环境变量

复制模板：

```bash
cp .env.example .env
```

至少需要填写：

- `PORT`
- `CORS_ORIGIN`
- `MYSQL_HOST`
- `MYSQL_PORT`
- `MYSQL_USER`
- `MYSQL_PASSWORD`
- `MYSQL_DATABASE`
- `DASHSCOPE_API_KEY`
- `BAIDU_API_KEY`
- `BAIDU_SECRET_KEY`

## 3. 初始化数据库

服务器上需要先准备 MySQL 8。最简单的 Docker 方式：

```bash
docker run -d --name pressure-mysql \
  -e MYSQL_ROOT_PASSWORD=请改成强密码 \
  -e MYSQL_DATABASE=pressure_admin \
  -e MYSQL_USER=pc_admin \
  -e MYSQL_PASSWORD=请改成强密码 \
  -p 3306:3306 \
  mysql:8.0
```

然后执行建表脚本：

```bash
npm run init-db
```

默认会创建 `admin / admin123` 管理员账号，上线前请尽快修改密码。

## 4. 启动

```bash
npm run start
```

默认健康检查：

```text
http://127.0.0.1:3001/api/health
```

## 5. 前端切换到新后端

网页前端增加环境变量：

```bash
VITE_API_BASE_URL=http://124.222.123.200:3001
```

然后重新构建前端：

```bash
npm run build
```

当前前端逻辑：

- 配了 `VITE_API_BASE_URL`：优先请求你自己的服务器
- 没配：继续回退到云函数

## 6. 当前范围

这版优先保障网页端主链路。

已覆盖：

- 管理员登录、改密、监管概览、台账中心、企业管理
- 企业登录、注册、设备台账、压力表台账、AI 识别存档
- PDF 首页面文本提取后的 AI 结构化识别

暂未纳入自建后端的微信专属能力：

- 小程序 `enterpriseAuth` 的 openid 绑定链路
- `expiryReminder` 订阅消息和微信模板消息链路
- 只在小程序里使用的云调用上下文能力
