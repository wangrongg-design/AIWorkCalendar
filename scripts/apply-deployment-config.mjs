import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const configPath = resolve(root, process.argv[2] ?? "config/deployment.json");

if (!existsSync(configPath)) {
  console.error(`Missing deployment config: ${configPath}`);
  console.error("Copy config/deployment.example.json to config/deployment.json and edit it first.");
  process.exit(1);
}

const config = JSON.parse(readFileSync(configPath, "utf8"));

function value(input) {
  return input === undefined || input === null ? "" : String(input);
}

function bool(input) {
  return input ? "true" : "false";
}

function hostFromUrl(url) {
  return new URL(url).host;
}

const env = [
  `DATABASE_URL=${value(config.database?.url)}`,
  "",
  `REDIS_HOST=${value(config.redis?.host)}`,
  `REDIS_PORT=${value(config.redis?.port ?? 6379)}`,
  `REDIS_PASSWORD=${value(config.redis?.password)}`,
  "",
  `JWT_SECRET=${value(config.auth?.jwtSecret)}`,
  `JWT_EXPIRES_IN=${value(config.auth?.jwtExpiresIn ?? "7d")}`,
  `REQUIRE_EMAIL_VERIFICATION=${bool(config.auth?.requireEmailVerification)}`,
  `CORS_ORIGIN=${value(config.api?.corsOrigin ?? config.domains?.webUrl)}`,
  "",
  `AI_PROVIDER=${value(config.ai?.provider ?? "mock")}`,
  `DEEPSEEK_API_KEY=${value(config.ai?.deepseekApiKey)}`,
  `DEEPSEEK_BASE_URL=${value(config.ai?.deepseekBaseUrl ?? "https://api.deepseek.com")}`,
  `DEEPSEEK_MODEL=${value(config.ai?.deepseekModel ?? "deepseek-v4-flash")}`,
  "",
  `OPENAI_API_KEY=${value(config.ai?.openaiApiKey)}`,
  `OPENAI_MODEL=${value(config.ai?.openaiModel ?? "gpt-4.1-mini")}`,
  "",
  `API_PORT=${value(config.api?.port ?? 3001)}`,
  `NEXT_PUBLIC_API_URL=${value(config.domains?.apiUrl)}`
].join("\n");

writeFileSync(resolve(root, ".env.production.generated"), `${env}\n`);

const miniProgramConfig = `module.exports = {
  apiBaseUrl: ${JSON.stringify(config.wechatMiniProgram?.apiBaseUrl ?? config.domains?.apiUrl ?? "http://localhost:3001")}
};
`;
writeFileSync(resolve(root, "apps/wechat-miniprogram/app.config.js"), miniProgramConfig);

const privateProjectConfig = {
  appid: config.wechatMiniProgram?.appid ?? "touristappid",
  projectname: "WorkCalendarAI",
  setting: {
    urlCheck: true
  }
};
writeFileSync(
  resolve(root, "apps/wechat-miniprogram/project.private.config.json"),
  `${JSON.stringify(privateProjectConfig, null, 2)}\n`
);

const webServerName = config.nginx?.webServerName ?? hostFromUrl(config.domains.webUrl);
const apiServerName = config.nginx?.apiServerName ?? hostFromUrl(config.domains.apiUrl);
const nginx = `server {
  listen 80;
  server_name ${webServerName};

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
  }
}

server {
  listen 80;
  server_name ${apiServerName};

  location / {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
`;
writeFileSync(resolve(root, "nginx/work-calendar.generated.conf"), nginx);

console.log("Generated deployment files:");
console.log("- .env.production.generated");
console.log("- apps/wechat-miniprogram/app.config.js");
console.log("- apps/wechat-miniprogram/project.private.config.json");
console.log("- nginx/work-calendar.generated.conf");
