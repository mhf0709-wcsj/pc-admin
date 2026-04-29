# pc-admin server

这个目录是网页端对应的独立后端，目标是把原来依赖微信云函数的网页能力迁到你自己的云服务器上。

当前已迁出的主链路：

- `webAdmin`：监管端和企业端台账读写
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
- `TCB_ENV_ID`
- `TCB_SECRET_ID`
- `TCB_SECRET_KEY`
- `DASHSCOPE_API_KEY`
- `BAIDU_API_KEY`
- `BAIDU_SECRET_KEY`

说明：

- 这版后端先直接连接原来的云开发数据库，所以网页端和小程序仍然共用同一套数据。
- 这一步只是把“云函数执行位置”迁到你自己的服务器，不是一次性改掉底层数据库。

## 3. 启动

```bash
npm run start
```

默认健康检查：

```text
http://127.0.0.1:3001/api/health
```

## 4. 前端切换到新后端

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

## 5. 当前范围

这版优先保障网页端主链路。

已覆盖：

- 管理员登录、改密、监管概览、台账中心、企业管理
- 企业登录、注册、设备台账、压力表台账、AI 识别存档
- PDF 首页面文本提取后的 AI 结构化识别

暂未迁完的微信专属能力：

- 小程序 `enterpriseAuth` 的 openid 绑定链路
- `expiryReminder` 订阅消息和微信模板消息链路
- 只在小程序里使用的云调用上下文能力
