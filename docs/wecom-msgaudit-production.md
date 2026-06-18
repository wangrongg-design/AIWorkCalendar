# 企业微信会话内容存档生产接入

AI Work Calendar 只支持企业微信官方「会话内容存档」能力，不支持个人微信、Hook、抓包、RPA、模拟客户端或非官方接口。

## 正式环境变量

生产环境建议显式配置：

```bash
WECOM_MSGAUDIT_MODE=official
WECOM_MSGAUDIT_ADAPTER_CMD=/opt/ai-work-calendar/wecom-msgaudit-adapter
WECOM_MSGAUDIT_ADAPTER_ARGS='[]'
WECOM_MSGAUDIT_ADAPTER_TIMEOUT_MS=120000
WECOM_MSGAUDIT_PULL_LIMIT=100
WECOM_MSGAUDIT_MEDIA_DIR=/data/ai-work-calendar/wecom-media
```

`WECOM_MSGAUDIT_ADAPTER_CMD` 必须指向你们基于企业微信官方会话内容存档 SDK 编译的适配器。适配器从 stdin 读取 JSON，并向 stdout 输出 JSON。AI Work Calendar 不内置个人微信或非官方采集逻辑。

## 密钥引用

企业微信集成页中的：

- 会话内容存档 secret
- RSA 私钥或密钥引用

支持三种写法：

```text
env:WECOM_MSGAUDIT_SECRET_TENANT_A
file:/etc/ai-work-calendar/wecom/tenant-a-private-key.pem
直接填写密钥内容
```

生产环境优先使用 `env:` 或 `file:`，避免在数据库中保存明文密钥。

## SDK 适配器 stdin

测试连接时：

```json
{
  "operation": "test",
  "tenantId": "tenant-id",
  "integrationId": "integration-id",
  "corpId": "wwxxxxxxxx",
  "msgAuditSecret": "resolved-secret",
  "rsaPrivateKey": "resolved-private-key"
}
```

增量同步时：

```json
{
  "operation": "pull",
  "tenantId": "tenant-id",
  "integrationId": "integration-id",
  "corpId": "wwxxxxxxxx",
  "msgAuditSecret": "resolved-secret",
  "rsaPrivateKey": "resolved-private-key",
  "seq": "0",
  "limit": 100,
  "chatId": null,
  "syncFiles": true,
  "storageDir": "/data/ai-work-calendar/wecom-media/tenant-id"
}
```

## SDK 适配器 stdout

测试连接成功：

```json
{ "ok": true }
```

增量同步成功：

```json
{
  "ok": true,
  "nextSeq": "12345",
  "rawCount": 2,
  "hasMore": false,
  "messages": [
    {
      "seq": "12344",
      "msgId": "msgid-from-wecom",
      "chatId": "wrxxxxxxxx",
      "chatName": "P2026-支付接入项目群",
      "senderWecomUserId": "zhangsan",
      "senderName": "张三",
      "senderType": "INTERNAL",
      "content": "今天完成支付回调联调。",
      "sentAt": "2026-06-18T09:30:00.000Z",
      "msgType": "TEXT",
      "files": []
    }
  ]
}
```

文件消息应返回：

```json
{
  "sdkFileId": "sdkfileid-from-wecom",
  "fileName": "验收问题清单.docx",
  "mimeType": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "fileSize": 186432,
  "kind": "FILE",
  "downloadStatus": "DOWNLOADED",
  "storagePath": "/data/ai-work-calendar/wecom-media/tenant-id/xxx.docx",
  "textContent": "可选的文件解析文本",
  "aiSummary": "可选的文件摘要"
}
```

外部联系人消息必须返回明确同意状态：

```json
{
  "senderType": "EXTERNAL",
  "externalUserId": "external-userid",
  "externalName": "客户联系人",
  "externalConsentStatus": "AGREED"
}
```

当 `externalConsentStatus` 不是 `AGREED` 时，AI Work Calendar 会跳过该消息，不入库、不分析。

## 官方 SDK 侧职责

适配器应基于企业微信官方会话内容存档 SDK 完成：

1. 使用 `corpId` 和会话内容存档 secret 初始化 SDK。
2. 从 checkpoint `seq` 开始增量拉取会话数据。
3. 使用 RSA 私钥解密 `encrypt_random_key`。
4. 解密会话明文。
5. 将 `roomid` 规范为 `chatId`。
6. 识别 `msgtype` 并规范为 `TEXT / FILE / IMAGE / VOICE / LINK / OTHER`。
7. 对文件、图片、语音等媒体使用 `sdkfileid` 下载到 `storageDir`。
8. 返回 `nextSeq`，AI Work Calendar 会写入 `wecom_sync_checkpoints.seq`。

## Web 测试步骤

1. 企业微信后台开通会话内容存档。
2. 配置存档成员、群聊范围、RSA 公钥、可信 IP。
3. 在服务器配置上面的正式环境变量。
4. 启动 API 和 Web。
5. 进入 `团队 / 企业设置 / 企业微信集成`。
6. 填写 `corpId`、secret 引用、RSA 私钥引用。
7. 点击 `测试连接`，状态应显示正式企业微信同步模式且 SDK 适配器可用。
8. 点击 `同步会话存档`。
9. 检查沟通来源、来源文件、客户群存档同意、项目群自动建议和候选日志草稿。

官方文档入口：[企业微信开发者中心：获取会话内容](https://developer.work.weixin.qq.com/document/path/91774)
