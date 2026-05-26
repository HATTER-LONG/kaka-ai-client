import { invoke } from "@tauri-apps/api/core";

export const AWANG_DEFAULT_BASE_URL = "https://api.mcorgai.com";

export interface AwangUsageRow {
  id?: string;
  route?: string;
  method?: string;
  statusCode?: number;
  model?: string;
  totalTokens?: number;
  remainingBalanceTokens?: number;
  accountRemainingTokens?: number;
  weeklyUsedTokens?: number;
  createdAt?: string;
}

export interface AwangUserProfile {
  id?: string;
  name?: string;
  loginName?: string;
  apiKey?: string;
  status?: string;
  balanceTokens?: number;
  totalRechargedTokens?: number;
  totalUsedTokens?: number;
  expiresAt?: string;
  weeklyLimitTokens?: number;
  manualWeeklyLimitTokens?: number;
  accountQuotaTokens?: number;
  accountWeeklyQuotaTokens?: number;
  weeklyUsedTokens?: number;
  weeklyRemainingTokens?: number;
  weekStartsAt?: string;
  accountRemainingTokens?: number;
  totalAvailableTokens?: number;
  accountBindings?: unknown;
  refresh?: unknown;
  note?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface AwangAuthPayload {
  user: AwangUserProfile;
  apiKey: string;
  accessToken?: string;
  refreshToken?: string;
  publicBaseUrl?: string;
  apiBaseUrl?: string;
  models?: unknown;
  modelList?: unknown;
  availableModels?: unknown;
  modelsError?: string;
  usage?: AwangUsageRow[];
  minimumTokensToStartRequest?: number;
}

export interface AwangPublicSettings {
  turnstileEnabled?: boolean;
  turnstileSiteKey?: string;
  siteName?: string;
}

export const awangApi = {
  login(
    username: string,
    password: string,
    turnstileToken?: string,
    baseUrl = AWANG_DEFAULT_BASE_URL,
  ): Promise<AwangAuthPayload> {
    return invoke("awang_login", {
      baseUrl,
      username,
      password,
      turnstileToken,
    });
  },

  getAccount(
    apiKey: string,
    baseUrl = AWANG_DEFAULT_BASE_URL,
  ): Promise<AwangAuthPayload> {
    return invoke("awang_get_account", { baseUrl, apiKey });
  },

  getPublicSettings(
    baseUrl = AWANG_DEFAULT_BASE_URL,
  ): Promise<AwangPublicSettings> {
    return invoke("awang_get_public_settings", { baseUrl });
  },

  redeem(
    code: string,
    accessToken: string,
    baseUrl = AWANG_DEFAULT_BASE_URL,
  ): Promise<AwangAuthPayload> {
    return invoke("awang_redeem", { baseUrl, code, accessToken });
  },
};
