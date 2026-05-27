# AIWorkCalendar 微信小程序

这是 AIWorkCalendar 的原生微信小程序前端，按最新版 iOS App 的核心结构开放移动端高频功能。

## 已实现功能

- 邮箱或手机号 + 密码登录，默认一个账号对应一个企业
- API 地址通过 `app.config.js` 或部署配置生成，不在用户登录页暴露
- AI日历：首页展示 AI 今日摘要、月度状态、风险日期和日期详情
- AI 对话生成日报/计划草稿
- 支持保存草稿和提交今日工作，复用现有 `/work-logs` 和 `/work-logs/:id/submit`
- 填报记录：搜索、筛选、点击查看详情和附件
- 项目：项目状态、负责人、截止时间和 AI 风险判断
- 我的：个人今日填报、今日工时、风险信号和近 7 日工时
- 日期详情：已填员工、未填员工、填报内容、AI 总结和风险
- 根据角色自动设置默认范围：
  - 企业管理员/超级管理员：全公司
  - 部门经理：本部门
  - 普通员工：只看自己

## 本地开发

1. 启动现有演示服务：

   ```bash
   pnpm demo:start
   ```

2. 打开微信开发者工具。

3. 导入项目目录：

   ```txt
   apps/wechat-miniprogram
   ```

4. AppID 可以先使用测试号或游客模式。正式发布时替换 `project.config.json` 里的 `appid`。

5. 本地开发时，在微信开发者工具里关闭：

   ```txt
   详情 -> 本地设置 -> 不校验合法域名、web-view、TLS 版本以及 HTTPS 证书
   ```

6. 演示账号：

   ```txt
   邮箱: admin@example.com
   密码: Passw0rd!
   ```

## 生产发布

生产环境必须使用 HTTPS API 域名，例如：

```txt
https://api.example.com
```

推荐通过根目录统一配置生成小程序 API 地址：

```bash
cp config/deployment.example.json config/deployment.json
pnpm config:apply
```

生成后的 `apps/wechat-miniprogram/app.config.js` 会写入生产 API 地址，`project.private.config.json` 会写入小程序 AppID。

需要在微信公众平台配置：

- 开发管理 -> 开发设置 -> 服务器域名 -> request 合法域名
- 添加后端 API 域名，例如 `https://api.example.com`

## 后端复用接口

小程序不新增业务后端，直接复用现有 SaaS API：

- `POST /auth/login`
- `GET /projects`
- `POST /work-logs`
- `GET /work-logs`
- `GET /work-logs/:id`
- `POST /work-logs/:id/submit`
- `GET /work-logs/:id/attachments/:attachmentId/download`
- `GET /analytics/calendar?month=YYYY-MM&scope=self|department|company`
- `GET /analytics/calendar/day?date=YYYY-MM-DD&scope=self|department|company`

## 注意事项

- 小程序端不会保存密码，只保存 JWT 和当前用户信息。
- 未来日期提交按“计划”使用，仍保存到现有 `work_logs` 表，并触发 AI 分析。
- 正式发布前需要替换真实 AppID，并完成域名配置和隐私协议配置。
