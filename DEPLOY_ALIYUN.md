# 阿里云部署指南

本文档用于把 Work Calendar AI 部署到阿里云生产环境。推荐架构：

```txt
Browser
  -> HTTPS / Nginx on ECS
  -> Web container + API container
  -> Alibaba Cloud RDS PostgreSQL
  -> Alibaba Cloud Redis / Tair
  -> DeepSeek API

WeChat Mini Program
  -> HTTPS API domain
  -> API container
```

## 1. 创建阿里云资源

建议资源：

- ECS: Ubuntu 22.04/24.04, 2C4G 起步
- RDS PostgreSQL: PostgreSQL 15/16，数据库名 `workcalendar`
- Redis/Tair: 标准版即可
- 域名:
  - `app.example.com` 指向前端
  - `api.example.com` 指向后端

安全组只开放：

- `22`: SSH，建议只允许你的固定 IP
- `80`: HTTP
- `443`: HTTPS

不要向公网开放 `3000`、`3001`、`5432`、`6379`。

## 2. 安装 ECS 依赖

```bash
apt update
apt install -y git curl ca-certificates docker.io docker-compose-plugin nginx
systemctl enable docker nginx
systemctl start docker nginx
```

验证：

```bash
docker --version
docker compose version
nginx -v
```

## 3. 拉取代码

```bash
cd /opt
git clone <your-repo-url> work-calendar-ai
cd work-calendar-ai
```

## 4. 配置统一部署文件

```bash
cp config/deployment.example.json config/deployment.json
nano config/deployment.json
```

关键项集中在这一份文件里：

```json
{
  "domains": {
    "webUrl": "https://app.example.com",
    "apiUrl": "https://api.example.com"
  },
  "database": {
    "url": "postgresql://workcalendar:<password>@<rds-internal-host>:5432/workcalendar?schema=public"
  },
  "redis": {
    "host": "<redis-internal-host>",
    "port": 6379,
    "password": "<redis-password>"
  },
  "ai": {
    "provider": "deepseek",
    "deepseekApiKey": "sk-xxx"
  },
  "wechatMiniProgram": {
    "appid": "你的微信小程序 AppID",
    "apiBaseUrl": "https://api.example.com"
  },
  "docker": {
    "webPortBind": "127.0.0.1:3000",
    "apiPortBind": "127.0.0.1:3001"
  }
}
```

`docker.webPortBind` 和 `docker.apiPortBind` 控制容器端口是否对公网开放：

- 备案前用 IP 测试：设置为 `"3000"` 和 `"3001"`，浏览器访问 `http://服务器IP:3000`。
- 正式域名通过 Nginx/HTTPS 访问：设置为 `"127.0.0.1:3000"` 和 `"127.0.0.1:3001"`，公网只开放 80/443。

生成生产配置：

```bash
pnpm config:apply
cp .env.production.generated .env
```

## 5. 启动容器

```bash
docker compose -f docker-compose.prod.yml up --build -d
```

初始化数据库：

```bash
bash scripts/prod-db-init.sh
```

说明：

- 生产容器启动时只生成 Prisma Client，不会自动 `db push` 或 `seed`。
- 首次部署、数据库表结构变更后，手动执行 `scripts/prod-db-init.sh`。
- 如果你不想在生产写入演示账号，可以把 `scripts/prod-db-init.sh` 里的 `seed` 命令删掉，只保留 `prisma:push`。

查看状态：

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f api
```

## 6. 配置 Nginx

复制生成的配置：

```bash
cp nginx/work-calendar.generated.conf /etc/nginx/conf.d/work-calendar.conf
```

检查并重载：

```bash
nginx -t
systemctl reload nginx
```

## 7. 配置 HTTPS

可以使用阿里云证书服务，也可以使用 Certbot。Certbot 示例：

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d app.example.com -d api.example.com
```

## 8. 验证

```bash
curl https://api.example.com/health
```

浏览器打开：

```txt
https://app.example.com
```

种子账号：

```txt
企业代码: demo
邮箱: admin@example.com
密码: Passw0rd!
```

订阅制说明：

- 新企业可以在首页自助注册，默认获得 1 个月、3 个成员席位的免费试用。
- 首次 seed 会给 demo 企业开通 `BUSINESS` 套餐和 30 个席位。
- 正式客户可由企业管理员创建订阅订单，再由平台超级管理员确认线下收款并自动开通套餐。
- 中国区接支付宝/微信支付时，把支付回调写入 `billing_orders` 和 `payment_records`，再更新 `subscriptions` 状态即可。

数据保密与导出：

- 系统按 `tenant_id` 做企业数据隔离，页面会提示所有企业数据均保密。
- 企业管理员可在「组织权限」页导出全企业 JSON 备份。
- 员工可导出自己的工作填报、汇报和通知数据。
- 导出文件不包含密码哈希等登录凭据。
- 企业或用户可在「组织权限 / 数据治理」提交数据删除申请，生产处理前应先完成备份交接和人工授权确认。

商业化发布前必查：

- 域名已完成 ICP 备案，并启用 HTTPS。
- 微信小程序已在公众平台配置 `request` 合法域名，例如 `https://api.example.com`。
- 微信小程序已添加语音识别插件，并在隐私协议中说明录音用途。
- RDS 开启自动备份，Redis 设置内网访问和密码。
- `.env` 中 `JWT_SECRET` 使用强随机值，不使用示例值。
- `REQUIRE_EMAIL_VERIFICATION` 根据实际邮件服务开关设置；开启前请先接入邮件发送。
- 线上 DeepSeek Key 有额度，并在 API 日志中确认 AI 分析、AI 汇报、日历问答正常。
- 订阅订单、数据导出、数据删除申请和审计日志在管理员账号下可访问。

## 9. DeepSeek 验证

1. 登录系统
2. 新增工作填报
3. 提交填报
4. 在填报总览打开 AI 对话，询问“今天有哪些风险？”
5. 查看 API 日志

```bash
docker compose -f docker-compose.prod.yml logs -f api
```

如果 `DEEPSEEK_API_KEY` 缺失或调用失败，业务提交不会中断；AI 会按任务失败/重试机制处理。

## 10. 更新发布

```bash
git pull
docker compose -f docker-compose.prod.yml up --build -d
```

如果数据库 schema 变更：

```bash
bash scripts/prod-db-init.sh
```
