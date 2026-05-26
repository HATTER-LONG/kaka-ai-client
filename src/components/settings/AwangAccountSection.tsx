import { useEffect, useMemo, useState } from "react";
import {
  Cloud,
  KeyRound,
  Loader2,
  LogOut,
  Power,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  AWANG_DEFAULT_BASE_URL,
  awangApi,
  providersApi,
  proxyApi,
  type AppId,
  type AwangAuthPayload,
} from "@/lib/api";
import { extractErrorMessage } from "@/utils/errorUtils";
import {
  AWANG_MANAGED_APP_IDS,
  AWANG_PROXY_APP_IDS,
  buildAwangProvider,
  buildOfficialProvider,
  getAwangModels,
  getAwangProviderId,
  getOfficialProviderId,
} from "@/config/awang";
import type { Provider } from "@/types";

export const AWANG_ACCOUNT_STORAGE_KEY = "awang-ai-account";
export const AWANG_SELECTED_MODEL_STORAGE_KEY = "awang-ai-selected-model";

export interface StoredAwangAccount {
  baseUrl: string;
  apiKey: string;
  accessToken?: string;
  payload: AwangAuthPayload;
}

export function loadStoredAccount(): StoredAwangAccount | null {
  try {
    const raw = localStorage.getItem(AWANG_ACCOUNT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredAwangAccount;
    if (!parsed.apiKey || !parsed.payload?.apiKey) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveStoredAccount(payload: AwangAuthPayload) {
  const stored: StoredAwangAccount = {
    baseUrl: AWANG_DEFAULT_BASE_URL,
    apiKey: payload.apiKey,
    accessToken: payload.accessToken,
    payload,
  };
  localStorage.setItem(AWANG_ACCOUNT_STORAGE_KEY, JSON.stringify(stored));
}

export function loadSelectedAwangModel(): string {
  return localStorage.getItem(AWANG_SELECTED_MODEL_STORAGE_KEY) || "";
}

export function saveSelectedAwangModel(modelId: string) {
  localStorage.setItem(AWANG_SELECTED_MODEL_STORAGE_KEY, modelId);
}

export function ensureSelectedAwangModel(payload: AwangAuthPayload): string {
  const models = getAwangModels(payload);
  if (models.length === 0) {
    throw new Error("卡卡AI后台没有返回可用模型，无法同步配置");
  }

  const saved = loadSelectedAwangModel();
  const selected = models.some((model) => model.id === saved)
    ? saved
    : models[0].id;
  saveSelectedAwangModel(selected);
  return selected;
}

function maskKey(value?: string) {
  if (!value) return "-";
  if (value.length <= 12) return "****";
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function formatTokens(value?: number | null) {
  if (typeof value !== "number" || Number.isNaN(value)) return "-";
  if (Math.abs(value) >= 100_000_000) {
    return `${(value / 100_000_000).toFixed(2)}亿`;
  }
  if (Math.abs(value) >= 10_000) {
    return `${(value / 10_000).toFixed(2)}万`;
  }
  return Math.round(value).toLocaleString("zh-CN");
}

function accountName(account: AwangAuthPayload | null) {
  const user = account?.user;
  return user?.name || user?.loginName || user?.id || "-";
}

function mergeProvider(next: Provider, existing?: Provider): Provider {
  return {
    ...next,
    createdAt: existing?.createdAt ?? next.createdAt,
    sortIndex: existing?.sortIndex ?? next.sortIndex,
  };
}

async function upsertProvider(appId: AppId, next: Provider) {
  const providers: Record<string, Provider> = await providersApi
    .getAll(appId)
    .catch(() => ({}));
  const existing = providers[next.id];
  const provider = mergeProvider(next, existing);
  if (existing) {
    await providersApi.update(provider, appId, next.id);
  } else {
    await providersApi.add(provider, appId, false);
  }
}

export async function syncManagedProviders(
  account: AwangAuthPayload,
  selectedModelId = ensureSelectedAwangModel(account),
) {
  for (const appId of AWANG_MANAGED_APP_IDS) {
    await upsertProvider(appId, buildOfficialProvider(appId));
    await upsertProvider(appId, buildAwangProvider(appId, account, selectedModelId));
  }
}

export async function switchManagedProviders(choice: "awang" | "official") {
  if (choice === "official") {
    for (const appId of AWANG_PROXY_APP_IDS) {
      await proxyApi.setProxyTakeoverForApp(appId, false);
    }
  }

  for (const appId of AWANG_MANAGED_APP_IDS) {
    const providerId =
      choice === "awang"
        ? getAwangProviderId(appId)
        : getOfficialProviderId(appId);
    await providersApi.switch(providerId, appId);
  }

  if (choice === "awang") {
    await proxyApi.startProxyServer();
    for (const appId of AWANG_PROXY_APP_IDS) {
      await proxyApi.setProxyTakeoverForApp(appId, true);
    }
  }
}

export function AwangAccountSection() {
  const queryClient = useQueryClient();
  const stored = useMemo(loadStoredAccount, []);
  const [account, setAccount] = useState<AwangAuthPayload | null>(
    stored?.payload ?? null,
  );
  const [username, setUsername] = useState(
    stored?.payload.user.loginName ?? "",
  );
  const [password, setPassword] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [switchingChoice, setSwitchingChoice] = useState<
    "awang" | "official" | null
  >(null);

  const quota = account?.user;
  const availableTokens =
    quota?.totalAvailableTokens ??
    quota?.accountRemainingTokens ??
    quota?.balanceTokens;

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["providers"] });
    await queryClient.invalidateQueries({ queryKey: ["proxyStatus"] });
    await queryClient.invalidateQueries({ queryKey: ["proxyTakeoverStatus"] });
    await providersApi.updateTrayMenu().catch(() => undefined);
  };

  const persistAccount = (payload: AwangAuthPayload) => {
    saveStoredAccount(payload);
    setAccount(payload);
    setUsername(payload.user.loginName || payload.user.name || username);
  };

  const refreshAccount = async (silent = false) => {
    const saved = loadStoredAccount();
    const accessToken =
      account?.accessToken ||
      saved?.accessToken ||
      account?.apiKey ||
      saved?.apiKey;
    if (!accessToken) return;
    setIsRefreshing(true);
    try {
      const payload = await awangApi.getAccount(accessToken);
      persistAccount(payload);
      if (!silent) {
        toast.success("额度已刷新");
      }
    } catch (error) {
      if (!silent) {
        toast.error(extractErrorMessage(error) || "刷新额度失败");
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (stored?.apiKey) {
      void refreshAccount(true);
    }
    // Only refresh the saved account once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogin = async () => {
    if (!username.trim() || !password) {
      toast.error("请输入账号和密码");
      return;
    }

    setIsLoggingIn(true);
    try {
      const payload = await awangApi.login(username.trim(), password);
      persistAccount(payload);
      setPassword("");
      await syncManagedProviders(payload);
      await invalidate();
      toast.success("已登录并同步卡卡AI接口");
    } catch (error) {
      toast.error(extractErrorMessage(error) || "登录失败");
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleSync = async () => {
    if (!account) return;
    setIsSyncing(true);
    try {
      await syncManagedProviders(account);
      await invalidate();
      toast.success("官方接口和卡卡AI接口已同步");
    } catch (error) {
      toast.error(extractErrorMessage(error) || "同步接口失败");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSwitch = async (choice: "awang" | "official") => {
    if (!account && choice === "awang") {
      toast.error("请先登录卡卡AI账号");
      return;
    }

    setSwitchingChoice(choice);
    try {
      if (account) {
        await syncManagedProviders(account);
      }
      await switchManagedProviders(choice);
      await invalidate();
      toast.success(choice === "awang" ? "已启用卡卡AI接口" : "已切回官方接口");
    } catch (error) {
      toast.error(extractErrorMessage(error) || "切换接口失败");
    } finally {
      setSwitchingChoice(null);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem(AWANG_ACCOUNT_STORAGE_KEY);
    setAccount(null);
    setPassword("");
    toast.success("已退出卡卡AI账号");
  };

  return (
    <section className="rounded-xl border border-border/60 bg-card/60 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Cloud className="h-5 w-5 text-primary" />
            <h3 className="text-base font-semibold">卡卡AI账号</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            登录后自动获取 SK 和 API 地址，并同步官方接口和卡卡AI接口。
          </p>
        </div>
        <Badge variant={account ? "default" : "secondary"}>
          {account ? "已登录" : "未登录"}
        </Badge>
      </div>

      {!account ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div className="space-y-2">
            <Label htmlFor="awang-username">账号</Label>
            <Input
              id="awang-username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              placeholder="输入卡卡AI邮箱"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="awang-password">密码</Label>
            <Input
              id="awang-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              placeholder="输入密码"
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void handleLogin();
                }
              }}
            />
          </div>
          <Button onClick={() => void handleLogin()} disabled={isLoggingIn}>
            {isLoggingIn ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="h-4 w-4" />
            )}
            登录
          </Button>
        </div>
      ) : (
        <div className="mt-6 space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-border/60 bg-background/60 p-3">
              <div className="text-xs text-muted-foreground">账号</div>
              <div className="mt-1 truncate text-sm font-medium">
                {accountName(account)}
              </div>
            </div>
            <div className="rounded-lg border border-border/60 bg-background/60 p-3">
              <div className="text-xs text-muted-foreground">SK</div>
              <div className="mt-1 font-mono text-sm">
                {maskKey(account.apiKey)}
              </div>
            </div>
            <div className="rounded-lg border border-border/60 bg-background/60 p-3">
              <div className="text-xs text-muted-foreground">可用额度</div>
              <div className="mt-1 text-sm font-medium">
                {formatTokens(availableTokens)}
              </div>
            </div>
            <div className="rounded-lg border border-border/60 bg-background/60 p-3">
              <div className="text-xs text-muted-foreground">本周剩余</div>
              <div className="mt-1 text-sm font-medium">
                {formatTokens(quota?.weeklyRemainingTokens)}
              </div>
            </div>
          </div>

          <div className="grid gap-3 text-sm sm:grid-cols-3">
            <div className="text-muted-foreground">
              已用：{" "}
              <span className="text-foreground">
                {formatTokens(quota?.totalUsedTokens)}
              </span>
            </div>
            <div className="text-muted-foreground">
              总充值：{" "}
              <span className="text-foreground">
                {formatTokens(quota?.totalRechargedTokens)}
              </span>
            </div>
            <div className="truncate text-muted-foreground">
              API：{" "}
              <span className="text-foreground">
                {account.apiBaseUrl || AWANG_DEFAULT_BASE_URL}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => void refreshAccount()}
              disabled={isRefreshing}
            >
              {isRefreshing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              刷新额度
            </Button>
            <Button
              variant="secondary"
              onClick={() => void handleSync()}
              disabled={isSyncing}
            >
              {isSyncing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <KeyRound className="h-4 w-4" />
              )}
              同步接口
            </Button>
            <Button
              onClick={() => void handleSwitch("awang")}
              disabled={switchingChoice !== null}
            >
              {switchingChoice === "awang" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Power className="h-4 w-4" />
              )}
              启用卡卡AI接口
            </Button>
            <Button
              variant="outline"
              onClick={() => void handleSwitch("official")}
              disabled={switchingChoice !== null}
            >
              {switchingChoice === "official" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ShieldCheck className="h-4 w-4" />
              )}
              切回官方接口
            </Button>
            <Button variant="ghost" onClick={handleLogout}>
              <LogOut className="h-4 w-4" />
              退出登录
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
