# 压力表智能管家网页端

这个目录是独立维护的网页工程，对应路径：

```text
D:\wechatsoftware\pc-admin
```

网页端和小程序共用同一套云开发环境、同一批数据库集合，企业端和管理端数据互通。

## 当前功能

- 监管端：监管概览、台账中心、企业管理、统计分析、账号设置
- 企业端：AI 管家、企业工作台、设备台账、压力表台账
- AI 管家：支持知识问答、PDF 解析、多张图片识别、识别后直接保存到共用台账

## 本地启动

```bash
npm install
npm run dev
```

默认访问：

```text
http://localhost:3000
```

## 构建发布

```bash
npm run build
```

构建产物目录：

```text
D:\wechatsoftware\pc-admin\dist
```

## 依赖的云函数

网页端依赖以下云函数：

- `cloudfunctions/webAdmin`
- `cloudfunctions/aiAssistant`
- `cloudfunctions/baiduOcr`

其中：

- `webAdmin` 负责监管端、企业端台账读写
- `aiAssistant` 负责 AI 问答和结构化识别
- `baiduOcr` 负责图片 OCR

修改这些云函数后，需要重新部署。

## 独立后端迁移

现在项目里新增了独立后端目录：

```text
D:\wechatsoftware\pc-admin\server
```

用途：

- 把网页端原本依赖的 `webAdmin / aiAssistant / baiduOcr` 迁到你自己的云服务器
- 前端通过 `VITE_API_BASE_URL` 切换到这个后端
- 后端当前仍然直连原来的云开发数据库，所以网页端和小程序数据继续互通

后端详细启动说明见：

```text
D:\wechatsoftware\pc-admin\server\README.md
```

## webAdmin 当前需要支持的动作

- `login`
- `changePassword`
- `getDashboard`
- `getRecords`
- `getEnterprises`
- `enterpriseLogin`
- `enterpriseRegister`
- `getEnterpriseDashboard`
- `getEnterpriseEquipments`
- `saveEnterpriseEquipment`
- `deleteEnterpriseEquipment`
- `getEnterpriseGauges`
- `getEnterpriseRecords`
- `saveEnterpriseAiRecord`

## 维护说明

- 网页源码：`D:\wechatsoftware\pc-admin\src`
- 小程序云函数：`D:\wechatsoftware\miniprogram-2\cloudfunctions`
- 企业端 AI 识别落库走 `webAdmin`，这样网页端和小程序端的数据始终共用一套来源
