import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { createDecipheriv, createSign, createVerify, randomBytes } from "crypto";
import { existsSync, readFileSync } from "fs";
import { PaymentProviderConfig, getPaymentProviderConfig } from "./payment.config";

type WechatNativeOrderInput = {
  orderId: string;
  description: string;
  amountCents: number;
  currency: string;
  attach?: string;
};

type WechatNotifyResource = {
  algorithm: string;
  ciphertext: string;
  associated_data?: string;
  nonce: string;
  original_type?: string;
};

type WechatNotifyBody = {
  id: string;
  create_time: string;
  event_type: string;
  resource_type: string;
  summary: string;
  resource: WechatNotifyResource;
};

export type WechatTransaction = {
  appid: string;
  mchid: string;
  out_trade_no: string;
  transaction_id?: string;
  trade_state: string;
  trade_state_desc?: string;
  attach?: string;
  amount?: {
    total?: number;
    payer_total?: number;
    currency?: string;
    payer_currency?: string;
  };
  success_time?: string;
};

@Injectable()
export class WechatPayService {
  private readonly logger = new Logger(WechatPayService.name);

  getConfig() {
    const config = getPaymentProviderConfig("WECHAT");
    if (!config) {
      throw new BadRequestException("微信支付暂未配置，请联系运维人员配置后再试。");
    }
    return config;
  }

  isLiveEnabled() {
    const config = this.getConfig();
    return config.enabled && config.mode === "live";
  }

  async createNativeOrder(input: WechatNativeOrderInput) {
    const config = this.assertLiveConfig(this.getConfig());
    const body = JSON.stringify({
      appid: config.appId,
      mchid: config.merchantId,
      description: input.description.slice(0, 127),
      out_trade_no: input.orderId,
      notify_url: config.notifyUrl,
      attach: input.attach,
      amount: {
        total: input.amountCents,
        currency: input.currency || "CNY"
      }
    });
    const response = await this.requestWechat<{ code_url?: string }>("/v3/pay/transactions/native", "POST", body, config);
    if (!response.code_url) {
      throw new BadRequestException("微信支付暂时没有返回二维码，请稍后重新创建订单。");
    }
    return {
      provider: "WECHAT" as const,
      mode: "live" as const,
      paymentUrl: response.code_url,
      qrCodeText: response.code_url,
      transactionId: input.orderId,
      amountCents: input.amountCents,
      notifyUrl: config.notifyUrl ?? null,
      returnUrl: config.returnUrl ?? null
    };
  }

  parseNotify(rawBody: string, headers: Record<string, string | string[] | undefined>) {
    const config = this.assertLiveConfig(this.getConfig());
    this.verifyNotifySignature(rawBody, headers, config);
    const body = JSON.parse(rawBody) as WechatNotifyBody;
    if (body.event_type !== "TRANSACTION.SUCCESS") {
      throw new BadRequestException("微信支付回调不是支付成功事件。");
    }
    const decrypted = this.decryptResource(body.resource, config);
    const transaction = JSON.parse(decrypted) as WechatTransaction;
    if (transaction.trade_state !== "SUCCESS") {
      throw new BadRequestException("微信支付尚未成功，请等待支付完成后重试。");
    }
    return transaction;
  }

  private async requestWechat<T>(path: string, method: string, body: string, config: RequiredWechatConfig) {
    const url = `https://api.mch.weixin.qq.com${path}`;
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: this.authorization(method, path, body, config),
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body
    });
    const text = await response.text();
    if (!response.ok) {
      this.logger.warn(`WeChat Pay request failed: ${response.status} ${text}`);
      throw new BadRequestException("微信支付下单失败，请稍后重试；如果反复出现，请联系运维人员。");
    }
    return JSON.parse(text) as T;
  }

  private authorization(method: string, path: string, body: string, config: RequiredWechatConfig) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = randomBytes(16).toString("hex");
    const message = `${method}\n${path}\n${timestamp}\n${nonce}\n${body}\n`;
    const signature = createSign("RSA-SHA256").update(message).sign(this.readMerchantPrivateKey(config), "base64");
    return `WECHATPAY2-SHA256-RSA2048 mchid="${config.merchantId}",nonce_str="${nonce}",signature="${signature}",timestamp="${timestamp}",serial_no="${config.merchantSerialNo}"`;
  }

  private verifyNotifySignature(rawBody: string, headers: Record<string, string | string[] | undefined>, config: RequiredWechatConfig) {
    const timestamp = this.header(headers, "wechatpay-timestamp");
    const nonce = this.header(headers, "wechatpay-nonce");
    const serial = this.header(headers, "wechatpay-serial");
    const signature = this.header(headers, "wechatpay-signature");
    if (!timestamp || !nonce || !serial || !signature) {
      throw new BadRequestException("微信支付回调缺少验签信息。");
    }
    if (config.platformSerialNo && serial !== config.platformSerialNo) {
      throw new BadRequestException("微信支付平台证书序列号不匹配。");
    }
    const publicKey = this.readPlatformPublicKey(config);
    const message = `${timestamp}\n${nonce}\n${rawBody}\n`;
    const verified = createVerify("RSA-SHA256").update(message).verify(publicKey, Buffer.from(signature, "base64"));
    if (!verified) {
      throw new BadRequestException("微信支付回调验签失败。");
    }
  }

  private decryptResource(resource: WechatNotifyResource, config: RequiredWechatConfig) {
    if (resource.algorithm !== "AEAD_AES_256_GCM") {
      throw new BadRequestException("微信支付回调加密算法不支持。");
    }
    const ciphertext = Buffer.from(resource.ciphertext, "base64");
    const authTag = ciphertext.subarray(ciphertext.length - 16);
    const encrypted = ciphertext.subarray(0, ciphertext.length - 16);
    const decipher = createDecipheriv("aes-256-gcm", Buffer.from(config.apiV3Key, "utf8"), Buffer.from(resource.nonce, "utf8"));
    if (resource.associated_data) {
      decipher.setAAD(Buffer.from(resource.associated_data, "utf8"));
    }
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  }

  private assertLiveConfig(config: PaymentProviderConfig): RequiredWechatConfig {
    if (config.mode !== "live") {
      throw new BadRequestException("当前是模拟支付环境，不需要调用微信支付。");
    }
    if (!config.appId || !config.merchantId || !config.merchantSerialNo || !config.apiV3Key) {
      throw new BadRequestException("微信支付配置不完整，请联系运维人员补齐商户配置。");
    }
    if (Buffer.byteLength(config.apiV3Key, "utf8") !== 32) {
      throw new BadRequestException("微信支付 API v3 密钥长度不正确，请确认已配置 32 位密钥。");
    }
    const privateKey = this.readMerchantPrivateKey(config);
    const platformPublicKey = this.readPlatformPublicKey(config, false);
    if (!privateKey) {
      throw new BadRequestException("微信支付商户私钥未配置，请联系运维人员。");
    }
    if (!platformPublicKey) {
      throw new BadRequestException("微信支付平台公钥未配置，无法安全接收支付回调。");
    }
    if (!config.platformSerialNo) {
      throw new BadRequestException("微信支付平台公钥序列号未配置，无法安全接收支付回调。");
    }
    return config as RequiredWechatConfig;
  }

  private readMerchantPrivateKey(config: PaymentProviderConfig) {
    return this.readPem(config.privateKeyPath, config.privateKey);
  }

  private readPlatformPublicKey(config: PaymentProviderConfig, required = true) {
    const value = this.readPem(config.platformPublicKeyPath, config.platformPublicKey);
    if (!value && required) {
      throw new BadRequestException("微信支付平台公钥未配置，无法安全接收支付回调。");
    }
    return value;
  }

  private readPem(path?: string, value?: string) {
    if (path && existsSync(path)) {
      return readFileSync(path, "utf8");
    }
    if (!value) return "";
    const trimmed = value.trim();
    if (trimmed.includes("BEGIN ")) {
      return trimmed.replace(/\\n/g, "\n");
    }
    try {
      return Buffer.from(trimmed, "base64").toString("utf8");
    } catch {
      return trimmed.replace(/\\n/g, "\n");
    }
  }

  private header(headers: Record<string, string | string[] | undefined>, name: string) {
    const value = headers[name] ?? headers[name.toLowerCase()];
    return Array.isArray(value) ? value[0] : value;
  }
}

type RequiredWechatConfig = PaymentProviderConfig & {
  appId: string;
  merchantId: string;
  merchantSerialNo: string;
  apiV3Key: string;
};
