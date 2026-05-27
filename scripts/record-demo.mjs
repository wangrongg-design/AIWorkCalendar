#!/usr/bin/env node
import { mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const root = process.cwd();
const webUrl = trimTrailingSlash(process.env.DEMO_WEB_URL ?? "http://localhost:3000");
const apiUrl = trimTrailingSlash(process.env.DEMO_API_URL ?? "http://localhost:3001");
const outputDir = path.resolve(
  root,
  process.env.DEMO_OUTPUT_DIR ?? path.join("tmp", "demo-recordings", timestamp())
);
const screenshotDir = path.join(outputDir, "screenshots");
const rawVideoDir = path.join(outputDir, "raw-video");
const finalVideoPath = path.join(outputDir, "work-calendar-ai-demo.webm");

const account = process.env.DEMO_ACCOUNT ?? "admin@example.com";
const password = process.env.DEMO_PASSWORD ?? "Passw0rd!";
const tenantCode = process.env.DEMO_TENANT_CODE ?? "91110105MA01A1B2X3";
const headless = process.env.DEMO_HEADLESS !== "false";
const slowMo = Number(process.env.DEMO_SLOWMO ?? (headless ? "180" : "260"));

let screenshotIndex = 1;

await main();

async function main() {
  await checkDemoServer();
  await mkdir(screenshotDir, { recursive: true });
  await mkdir(rawVideoDir, { recursive: true });

  const browser = await chromium.launch({ headless, slowMo });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    locale: "zh-CN",
    recordVideo: {
      dir: rawVideoDir,
      size: { width: 1440, height: 900 }
    }
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);

  const video = page.video();

  try {
    await step(page, "打开产品首页", async () => {
      await page.goto(`${webUrl}/`, { waitUntil: "domcontentloaded" });
      await page.getByRole("heading", { name: /用日历管理团队日报/ }).waitFor();
      await screenshot(page, "landing");
    });

    await step(page, "登录演示企业管理员账号", async () => {
      await page.getByRole("button", { name: "已有账号登录" }).click();
      await page.waitForURL("**/login");
      await page.waitForLoadState("networkidle");
      const tenantCodeInput = page.locator("#tenantCode");
      if ((await tenantCodeInput.count()) > 0) {
        await replaceInput(tenantCodeInput, tenantCode);
      }
      await replaceInput(page.locator("#account"), account);
      await replaceInput(page.locator("#password"), password);
      await page.locator("form").filter({ hasText: "邮箱或手机号" }).locator('button[type="submit"]').click();
      await page.waitForURL("**/dashboard");
      await page.getByRole("heading", { name: "日历看板" }).waitFor();
      await page.getByRole("menuitem", { name: /工作填报/ }).waitFor();
      await screenshot(page, "dashboard");
    });

    await step(page, "展示月历 AI 问答", async () => {
      await page.getByRole("button", { name: /AI 对话/ }).click();
      await page.getByText("AI 日历问答").waitFor();
      await page.getByRole("button", { name: "总结本月团队重点" }).click();
      await page.getByText(/参考 \d+ 条记录/).waitFor();
      await screenshot(page, "calendar-ai-answer");
      await closeDrawer(page);
    });

    await step(page, "用自然语言生成工作填报草稿", async () => {
      await navigate(page, "工作填报", "/work-logs");
      await page.getByRole("button", { name: /新增填报/ }).click();
      const modal = page.locator(".ant-modal").filter({ hasText: "新增填报" });
      await modal.getByText("AI 对话填报").waitFor();
      await modal
        .getByPlaceholder(/今天完成小程序语音填报/)
        .fill("今天完成演示录屏脚本，联调智能汇报生成，花了 2 小时。风险是正式录制前要先确认演示数据干净。");
      await modal.getByRole("button", { name: /生成草稿/ }).click();
      await modal.getByText(/已整理为日报草稿/).waitFor();
      await modal.getByLabel("标题").fill("演示录屏脚本联调");
      await modal
        .getByLabel("工作内容")
        .fill("完成演示录屏脚本，联调日历看板、AI 问答、工作填报和智能汇报生成流程，确认可产出宣传视频素材。");
      await screenshot(page, "ai-draft");
      await modal.locator(".ant-modal-footer .ant-btn-primary").click();
      await page.locator("tr").filter({ hasText: "演示录屏脚本联调" }).waitFor();
      await screenshot(page, "worklog-created");
    });

    await step(page, "提交填报并展示 AI 分析结果", async () => {
      const row = page.locator("tr").filter({ hasText: "演示录屏脚本联调" }).first();
      await row.getByRole("button", { name: /提交/ }).click();
      await row.getByText("已提交").waitFor();
      await row.getByText("常规工时").waitFor();
      await screenshot(page, "worklog-submitted");
    });

    await step(page, "生成智能汇报并展示 Word 下载入口", async () => {
      await navigate(page, "智能汇报", "/reports");
      await page.getByRole("button", { name: /生成报告/ }).click();
      await page.locator("tr").filter({ hasText: "个人日报" }).first().waitFor();
      await page.getByText("已完成").first().waitFor();
      await screenshot(page, "report-generated");
    });

    await step(page, "展示企业管理与订阅边界", async () => {
      await navigate(page, "企业管理", "/org");
      await page.getByRole("heading", { name: "组织权限" }).waitFor();
      await screenshot(page, "org-management");
    });
  } finally {
    await page.close();
    const rawVideoPath = await video.path();
    await context.close();
    await browser.close();
    await rename(rawVideoPath, finalVideoPath);
    await rm(rawVideoDir, { recursive: true, force: true });
  }

  console.log("");
  console.log("Demo recording complete.");
  console.log(`Video: ${finalVideoPath}`);
  console.log(`Screenshots: ${screenshotDir}`);
}

async function checkDemoServer() {
  const health = await fetch(`${apiUrl}/health`).catch(() => null);
  if (!health?.ok) {
    throw new Error(`API is not reachable at ${apiUrl}. Run "pnpm demo:start" first.`);
  }

  const web = await fetch(`${webUrl}/login`, { method: "HEAD" }).catch(() => null);
  if (!web?.ok) {
    throw new Error(`Web app is not reachable at ${webUrl}. Run "pnpm demo:start" first.`);
  }
}

async function step(page, label, action) {
  console.log(`- ${label}`);
  await action();
  await page.waitForTimeout(900);
}

async function navigate(page, menuLabel, route) {
  const item = page.getByRole("menuitem", { name: new RegExp(menuLabel) });
  if (await item.count()) {
    await item.click();
  } else {
    await page.goto(`${webUrl}${route}`, { waitUntil: "domcontentloaded" });
  }
  await page.waitForURL(`**${route}`);
  await page.waitForTimeout(500);
}

async function screenshot(page, slug) {
  const name = `${String(screenshotIndex).padStart(2, "0")}-${slug}.png`;
  screenshotIndex += 1;
  await page.screenshot({
    path: path.join(screenshotDir, name),
    fullPage: false
  });
}

async function closeDrawer(page) {
  const closeButton = page.locator(".ant-drawer-close").first();
  if (await closeButton.count()) {
    await closeButton.click();
    await page.locator(".ant-drawer").waitFor({ state: "hidden" }).catch(() => undefined);
  }
}

async function replaceInput(locator, value) {
  await locator.click();
  await locator.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await locator.press("Backspace");
  await locator.type(value);
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}
