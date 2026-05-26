import { useEffect, useState } from "react";
import {
  CalendarClock,
  KeyRound,
  Loader2,
  RefreshCw,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AWANG_DEFAULT_BASE_URL,
  awangApi,
  type AwangAuthPayload,
} from "@/lib/api";
import { extractErrorMessage } from "@/utils/errorUtils";
import {
  loadStoredAccount,
  saveStoredAccount,
  syncManagedProviders,
} from "@/components/settings/AwangAccountSection";

function formatNumber(value?: number | null) {
  if (typeof value !== "number" || Number.isNaN(value)) return "-";
  if (Math.abs(value) >= 100_000_000)
    return `${(value / 100_000_000).toFixed(2)} 亿`;
  if (Math.abs(value) >= 10_000) return `${(value / 10_000).toFixed(2)} 万`;
  return Math.round(value).toLocaleString("zh-CN");
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function maskKey(value?: string) {
  if (!value) return "-";
  if (value.length <= 12) return "****";
  return `${value.slice(0, 7)}...${value.slice(-5)}`;
}

export function OriginDashboard() {
  const [account, setAccount] = useState<AwangAuthPayload | null>(
    () => loadStoredAccount()?.payload ?? null,
  );
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refresh = async (silent = false) => {
    const stored = loadStoredAccount();
    const token = stored?.accessToken;
    if (!token) return;

    setIsRefreshing(true);
    try {
      const payload = await awangApi.getAccount(token);
      saveStoredAccount(payload);
      await syncManagedProviders(payload);
      setAccount(payload);
      if (!silent) toast.success("仪表盘已刷新");
    } catch (error) {
      if (!silent) {
        toast.error(extractErrorMessage(error) || "刷新仪表盘失败");
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    void refresh(true);
  }, []);

  const user = account?.user;
  const available =
    user?.totalAvailableTokens ??
    user?.accountRemainingTokens ??
    user?.balanceTokens;

  return (
    <div className="flex flex-1 flex-col overflow-y-auto px-6 pb-12 pt-2">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">仪表盘</h2>
          <p className="text-sm text-muted-foreground">
            {user?.name || user?.loginName || "卡卡AI账号"}
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={() => void refresh()}
          disabled={isRefreshing}
        >
          {isRefreshing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          刷新
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <section className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">可用额度</span>
            <Wallet className="h-4 w-4 text-primary" />
          </div>
          <div className="mt-3 text-2xl font-semibold">
            {formatNumber(available)}
          </div>
        </section>
        <section className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">已用额度</span>
            <RefreshCw className="h-4 w-4 text-primary" />
          </div>
          <div className="mt-3 text-2xl font-semibold">
            {formatNumber(user?.totalUsedTokens)}
          </div>
        </section>
        <section className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">本周剩余</span>
            <KeyRound className="h-4 w-4 text-primary" />
          </div>
          <div className="mt-3 text-2xl font-semibold">
            {formatNumber(user?.weeklyRemainingTokens)}
          </div>
        </section>
        <section className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">到期时间</span>
            <CalendarClock className="h-4 w-4 text-primary" />
          </div>
          <div className="mt-3 text-base font-semibold">
            {formatDate(user?.expiresAt)}
          </div>
        </section>
      </div>

      <section className="mt-5 rounded-lg border border-border bg-card p-4">
        <h3 className="text-base font-semibold">当前接口</h3>
        <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
          <div>
            <div className="text-muted-foreground">API 地址</div>
            <div className="mt-1 font-mono">
              {account?.apiBaseUrl || `${AWANG_DEFAULT_BASE_URL}/v1`}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground">SK</div>
            <div className="mt-1 font-mono">{maskKey(account?.apiKey)}</div>
          </div>
        </div>
      </section>
    </div>
  );
}
