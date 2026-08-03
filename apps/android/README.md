# AIWorkCalendar Android

原生 Android 版，产品结构对齐当前 iOS App：

- 登录：邮箱/手机号 + 密码，不展示企业代码。
- AI日历：首页是“AI 今日简报”，不展示完整月历网格。
- 填报：极简“说/写一句 -> AI整理日报 -> 确认提交”流程。
- 记录：日报草稿、已提交和风险记录列表。
- 项目：项目状态、负责人和异常筛选。
- 我的：账号、企业信息和工作画像。

## 本地 API 地址

Android 模拟器访问宿主机不能使用 `localhost`，默认使用：

```text
http://10.0.2.2:3001
```

如需覆盖：

```bash
gradle :app:assembleDebug -PAIWC_API_BASE_URL=http://10.0.2.2:3001
```

真机调试时请改成 Mac 局域网 IP，例如：

```bash
gradle :app:assembleDebug -PAIWC_API_BASE_URL=http://192.168.1.10:3001
```

## 本地运行

1. 安装 Android Studio、JDK 17、Android SDK。
2. 用 Android Studio 打开 `apps/android`。
3. 启动后端本地服务，确保 API 可访问。
4. 选择一个 Android 模拟器。
5. 点击 Run，或在已安装 Gradle 的环境里执行：

```bash
gradle :app:assembleDebug
```

## 权限

填报页语音输入使用系统语音识别能力，会请求：

- `RECORD_AUDIO`

语音只转文字并填入输入框，不会自动提交日报。
