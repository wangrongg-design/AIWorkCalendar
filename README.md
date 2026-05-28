# Work Calendar AI

面向企业的 AI 工作填报与智能汇报 SaaS。当前版本由北京七数智联科技有限公司开发，覆盖企业注册、登录、订阅计费、订阅订单、组织权限、项目基本信息、每日工作填报、管理月历、AI 分析、AI 汇报、系统内通知、运维监管、审计日志、数据导出和数据删除申请。

## 技术栈

- Web: Next.js, React, TypeScript, TailwindCSS, Ant Design, React Query, Zustand
- Mini Program: 原生微信小程序，微信同声传译语音识别插件
- API: NestJS, TypeScript, REST API, Swagger, JWT, RBAC
- Data: PostgreSQL, Prisma
- Queue: Redis, BullMQ
- AI: OpenAI / DeepSeek 双 Provider, JSON structured output, prompt 模板化入口
- Deploy: Docker Compose

## 快速启动

```bash
cp .env.example .env
docker compose up --build
```

服务地址：

- Web: http://localhost:3000
- API: http://localhost:3001
- Swagger: http://localhost:3001/docs

种子企业的统一社会信用代码为 `91110105MA01A1B2X3`，所有种子账号密码都是 `Passw0rd!`：

- `admin@example.com` 企业管理员
- `manager@example.com` 研发经理
- `employee@example.com` 普通员工
- `employee2@example.com` 产品员工
- `super@example.com` 超级管理员

运维端入口为 `http://localhost:3000/ops/login`。初始化运维账号为 `super@example.com` / `Passw0rd!`，首次进入后可在运维控制台右上角点击「修改密码」更新密码。清空本地演示数据时会保留该运维账号和一个企业管理员账号，避免系统无法进入。

## 本地演示模式

如果本机暂时没有 Docker、PostgreSQL 或 Redis，可以用内存 API 跑完整前端演示：

```bash
pnpm install
pnpm demo:start
```

演示模式地址同样是：

- Web: http://localhost:3000
- API: http://localhost:3001

常用命令：

```bash
pnpm demo:status
pnpm demo:stop
```

演示模式数据保存在内存里，重启后会恢复种子数据；正式发布请使用 Docker Compose 或云数据库部署。

## 本地开发

需要 Node 22+ 和 pnpm。

```bash
pnpm install
pnpm --filter @work-calendar-ai/api prisma:generate
pnpm --filter @work-calendar-ai/api prisma:push
pnpm --filter @work-calendar-ai/api seed
pnpm dev
```

如果 `AI_PROVIDER=mock`，后端会使用本地 deterministic fallback 生成 AI 分析和报告，保证 MVP 闭环可跑。

## AI Provider 配置

后端支持 `AI_PROVIDER=mock|openai|deepseek`：

```env
AI_PROVIDER=mock

OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini

DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-flash
```

OpenAI 模式使用 Responses API 和 JSON Schema structured output。DeepSeek 模式使用 OpenAI-compatible Chat Completions 和 `response_format: { "type": "json_object" }`。如果指定了 `openai` 或 `deepseek` 但没有配置对应 API Key，系统会自动回退到 mock，避免填报提交流程被 AI 阻塞。

日报附件会在提交后进入同一条 AI 分析链路。OpenAI 模式会把图片附件以内联图片输入参与分析；DeepSeek/mock 模式会使用附件元数据、摘要和可解析文本摘录。

阿里云生产环境推荐：

```env
AI_PROVIDER=deepseek
DEEPSEEK_API_KEY=sk-你的DeepSeekKey
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-flash
```

DeepSeek 官方文档入口：<https://api-docs.deepseek.com/>。

## 支付配置

订阅订单支持支付宝和微信支付。支付配置集中在 `apps/api/src/modules/billing/payment.config.ts`，生产环境由主控窗口统一注入环境变量，不要把商户密钥写进代码仓库：

```env
BILLING_PAYMENT_MODE=mock
PUBLIC_WEB_URL=https://your-web.example.com
PUBLIC_API_URL=https://your-api.example.com

ALIPAY_APP_ID=
ALIPAY_PRIVATE_KEY=
ALIPAY_NOTIFY_URL=
ALIPAY_RETURN_URL=

WECHAT_PAY_APP_ID=
WECHAT_PAY_MCH_ID=
WECHAT_PAY_MCH_SERIAL_NO=
WECHAT_PAY_PRIVATE_KEY_PATH=
WECHAT_PAY_PRIVATE_KEY=
WECHAT_PAY_API_V3_KEY=
WECHAT_PAY_PLATFORM_SERIAL_NO=
WECHAT_PAY_PLATFORM_PUBLIC_KEY_PATH=
WECHAT_PAY_PLATFORM_PUBLIC_KEY=
WECHAT_PAY_NOTIFY_URL=
WECHAT_PAY_RETURN_URL=
```

`BILLING_PAYMENT_MODE=mock` 用于本地联调，会生成模拟支付链接并允许在后台点击“模拟支付完成”。`live` 模式下，微信支付使用 Native 下单生成二维码，支付成功后由 `/billing/payments/wechat/notify` 回调验签、解密、校验金额并自动开通订阅。生产密钥建议通过 `*_PATH` 指向挂载的密钥文件，不要写进仓库。

## 冒烟测试

在 API 服务启动后执行：

```bash
pnpm test:smoke
```

该脚本会验证登录、组织读取、创建填报、提交填报、月历查询和报告生成任务。

## 发布前检查

```bash
pnpm --filter @work-calendar-ai/api lint
pnpm --filter @work-calendar-ai/web lint
DATABASE_URL="postgresql://workcalendar:workcalendar@localhost:5432/workcalendar?schema=public" pnpm --filter @work-calendar-ai/api exec prisma validate
pnpm build
```

发布前建议确认：

- `.env` 已设置强随机 `JWT_SECRET`
- `DATABASE_URL` 指向生产 PostgreSQL
- `REDIS_HOST` / `REDIS_PORT` 指向生产 Redis
- `AI_PROVIDER` 已设为目标 Provider
- `OPENAI_API_KEY` 或 `DEEPSEEK_API_KEY` 已按 Provider 配置
- Web 的 `NEXT_PUBLIC_API_URL` 指向公开 API 域名
- PostgreSQL、Redis、API、Web 都有健康检查和日志采集

## 核心接口

- `POST /auth/login`
- `POST /auth/register` 企业自助注册，默认 1 个月免费试用，试用期不限制成员人数
- `GET /auth/me`
- `POST /auth/password-reset/request`
- `POST /auth/password-reset/confirm`
- `POST /auth/change-password`
- `POST /auth/verify-email`
- `GET /org`
- `POST /org/tenants` 超级管理员创建企业与初始企业管理员
- `POST /org/departments`
- `PATCH /org/departments/:id`
- `POST /org/users`
- `PATCH /org/users/:id`
- `GET /projects`
- `POST /projects`
- `PATCH /projects/:id`
- `DELETE /projects/:id`
- `GET /work-logs`
- `POST /work-logs`
- `GET /work-logs/:id`
- `PATCH /work-logs/:id`
- `DELETE /work-logs/:id`
- `POST /work-logs/:id/attachments` 上传日报附件，JSON body 使用 base64，单个最大 8MB
- `DELETE /work-logs/:id/attachments/:attachmentId` 删除日报附件
- `GET /work-logs/:id/attachments/:attachmentId/download` 下载日报附件
- `POST /work-logs/:id/submit`
- `GET /analytics/calendar?month=YYYY-MM&scope=self|department|company&departmentId=`
- `GET /analytics/calendar/day?date=YYYY-MM-DD&scope=self|department|company&departmentId=`
- `GET /ai/analyses/work-logs/:workLogId`
- `POST /ai/analyses/work-logs/:workLogId/retry`
- `POST /ai/work-log-draft` AI 对话生成日报/计划草稿
- `POST /ai/chat/calendar`
- `POST /reports/generate`
- `GET /reports`
- `GET /notifications`
- `POST /notifications/:id/read`
- `POST /notifications/read-all`
- `GET /billing/subscription`
- `GET /billing/plans`
- `GET /billing/orders`
- `POST /billing/orders`
- `GET /billing/orders/:orderId/payment`
- `POST /billing/orders/:orderId/confirm-online-payment` 本地 mock 支付确认，生产支付应使用平台回调确认
- `POST /billing/payments/wechat/notify` 微信支付回调，公开接口，内部执行验签、解密和金额校验
- `POST /billing/orders/:orderId/confirm-manual-payment` 超级管理员确认线下收款
- `PATCH /billing/subscription` 超级管理员调整当前企业订阅
- `PATCH /billing/tenants/:tenantId/subscription` 超级管理员调整指定企业订阅
- `GET /ops/overview` 开发公司超级管理员查看全平台概览
- `PATCH /ops/accounts/:id` 开发公司超级管理员启停账号
- `GET /audit-logs?limit=100` 企业管理员查看审计日志
- `GET /exports/data?scope=self|tenant` 导出用户或企业数据备份
- `POST /exports/data-tasks?scope=self|tenant` 创建异步导出任务
- `GET /exports/data-tasks` 查看当前账号创建的导出任务
- `GET /exports/data-tasks/:id/download` 下载已完成且未过期的备份压缩包
- `GET /privacy/data-deletion-requests`
- `POST /privacy/data-deletion-requests`

## 订阅制边界

第一版采用“企业免费试用 1 个月，正式使用 ¥19 / 启用成员 / 月”的订阅模式。新企业可在首页自助注册，默认获得 `TRIAL` 套餐、`TRIALING` 状态和 1 个月试用期；试用期内不限制成员人数，并开放完整 AI 工作日历功能。试用结束后进入专业版，按企业内启用成员数量计费；本周期新增成员立即可用，下个周期开始计费，本周期停用成员不退款，下个周期不再计费。

当前版本已补齐商业化闭环：企业管理员可按启用成员数创建订阅订单，平台超级管理员可确认线下收款；微信支付可在生产环境通过 Native 扫码支付和回调自动开通专业版。支付宝和 Stripe Provider 仍为后续扩展预留。

## 数据保密与导出

所有企业数据按 `tenant_id` 租户隔离，并在产品页面明确提示“企业数据均保密”。企业管理员可在「组织权限」页创建全企业导出任务；普通员工可创建个人导出任务。后台会生成 ZIP 压缩包并记录导出任务、状态、文件大小和下载有效期，内容包含组织、用户、工作填报、AI 分析、汇报、通知、订阅、账单、审计、导出任务和数据删除申请；导出不会包含密码哈希等登录凭据。

导出文件默认写入容器内 `/app/storage/exports`，生产环境通过 `EXPORT_STORAGE_HOST_DIR` 挂载到宿主机持久化目录。推荐在 `config/deployment.json` 增加：

```json
{
  "exports": {
    "hostDir": "/data/work-calendar-ai/exports",
    "containerDir": "/app/storage/exports"
  }
}
```

日报附件默认写入 API 进程工作目录下的 `tmp/work-log-attachments`。生产环境建议配置 `WORK_LOG_ATTACHMENT_DIR` 指向持久化目录，例如 `/app/storage/work-log-attachments`，并把该目录挂载到宿主机或对象存储同步目录。

## 商业化关键项

当前版本已补齐发布前必须有的基础能力：

- 账号安全：登录限流、连续失败锁定、密码重置、修改密码、邮箱验证令牌结构。
- 订阅计费：1 个月不限人数试用、按启用成员数计费、订阅订单、支付记录、线下收款确认。
- 审计追踪：登录、注册、密码、组织变更、订阅、导出和数据删除申请记录审计日志。
- 数据治理：企业/个人导出备份、数据删除申请、租户隔离说明。
- AI 生产切换：`AI_PROVIDER=mock|openai|deepseek`，阿里云可直接切 DeepSeek。

仍建议正式投放前按实际销售方式接入短信/邮件服务、ICP备案域名、HTTPS 证书、支付网关回调、日志告警、数据库自动备份和等保/隐私合规材料。

## 第一版边界

本工程刻意不包含复杂项目管理、BI 大屏、审批流、OKR、CRM、IM、文件协同和复杂自定义报表。代码中保留了第三方登录、外部通知、平台超级管理员扩展的结构入口，但第一版主流程不依赖它们。

## 阿里云部署

生产部署步骤见 [DEPLOY_ALIYUN.md](DEPLOY_ALIYUN.md)。生产容器默认不会自动写入 seed 数据，请在首次发布或 schema 变更后执行：

```bash
bash scripts/prod-db-init.sh
```

## 微信小程序

小程序工程位于 [apps/wechat-miniprogram](/Users/wangrong/Documents/AIWorkCalendar/apps/wechat-miniprogram)。它复用现有 API，提供移动端快速语音填报、提交日报/计划、查看月历看板和日期详情。导入微信开发者工具即可运行，具体步骤见 [apps/wechat-miniprogram/README.md](/Users/wangrong/Documents/AIWorkCalendar/apps/wechat-miniprogram/README.md)。

## 统一部署配置

云服务器部署时，先把 [config/deployment.example.json](/Users/wangrong/Documents/AIWorkCalendar/config/deployment.example.json) 复制为 `config/deployment.json`，只改这一份配置：

```bash
cp config/deployment.example.json config/deployment.json
pnpm config:apply
```

脚本会生成：

- `.env.production.generated`
- `nginx/work-calendar.generated.conf`
- `apps/wechat-miniprogram/app.config.js`
- `apps/wechat-miniprogram/project.private.config.json`

之后把 `.env.production.generated` 用作生产 `.env`，把生成的 Nginx 配置复制到服务器 Nginx 配置目录。

生产 Docker 端口绑定也从 `config/deployment.json` 生成。备案前需要用 IP 直接访问时：

```json
"docker": {
  "webPortBind": "3000",
  "apiPortBind": "3001"
}
```

备案完成并通过 Nginx/HTTPS 访问时，改回只监听本机：

```json
"docker": {
  "webPortBind": "127.0.0.1:3000",
  "apiPortBind": "127.0.0.1:3001"
}
```
