import { useEffect, useState } from "react";
import { Gift, Loader2, RefreshCw, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AWANG_DEFAULT_BASE_URL, awangApi, type AwangAuthPayload } from "@/lib/api";
import { extractErrorMessage } from "@/utils/errorUtils";
import {
  loadStoredAccount,
  saveStoredAccount,
  syncManagedProviders,
} from "@/components/settings/AwangAccountSection";

function formatNumber(value?: number | null) {
  if (typeof value !== "number" || Number.isNaN(value)) return "-";
  if (Math.abs(value) >= 100_000_000) {
    return `${(value / 100_000_000).toFixed(2)} 亿`;
  }
  if (Math.abs(value) >= 10_000) {
    return `${(value / 10_000).toFixed(2)} 万`;
  }
  return Math.round(value).toLocaleString("zh-CN");
}

function availableBalance(account: AwangAuthPayload | null) {
  const user = account?.user;
  return (
    user?.totalAvailableTokens ??
    user?.accountRemainingTokens ??
    user?.balanceTokens
  );
}

export function OriginRedeemPage() {
  const [account, setAccount] = useState<AwangAuthPayload | null>(
    () => loadStoredAccount()?.payload ?? null,
  );
  const [code, setCode] = useState("");
  const [isRedeeming, setIsRedeeming] = useState(false);
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
      if (!silent) toast.success("余额已刷新");
    } catch (error) {
      if (!silent) toast.error(extractErrorMessage(error) || "刷新余额失败");
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    void refresh(true);
  }, []);

  const handleRedeem = async () => {
    const stored = loadStoredAccount();
    const token = stored?.accessToken;
    const value = code.trim();
    if (!token) {
      toast.error("请先登录卡卡AI账号");
      return;
    }
    if (!value) {
      toast.error("请输入兑换码");
      return;
    }

    setIsRedeeming(true);
    try {
      const payload = await awangApi.redeem(
        value,
        token,
        stored.baseUrl || AWANG_DEFAULT_BASE_URL,
      );
      saveStoredAccount(payload);
      await syncManagedProviders(payload);
      setAccount(payload);
      setCode("");
      toast.success("兑换成功");
    } catch (error) {
      toast.error(extractErrorMessage(error) || "兑换失败");
    } finally {
      setIsRedeeming(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col overflow-y-auto px-6 pb-12 pt-2">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">兑换码</h2>
          <p className="text-sm text-muted-foreground">
            输入兑换码后自动更新当前账号余额
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
          刷新余额
        </Button>
      </div>

      <section className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-muted-foreground">当前可用余额</div>
            <div className="mt-2 text-3xl font-semibold">
              {formatNumber(availableBalance(account))}
            </div>
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Wallet className="h-6 w-6" />
          </div>
        </div>
      </section>

      <section className="mt-5 rounded-lg border border-border bg-card p-5">
        <div className="mb-3 flex items-center gap-2 text-base font-semibold">
          <Gift className="h-4 w-4 text-primary" />
          兑换
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Input
            value={code}
            onChange={(event) => setCode(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void handleRedeem();
            }}
            placeholder="请输入兑换码"
            className="font-mono"
          />
          <Button onClick={() => void handleRedeem()} disabled={isRedeeming}>
            {isRedeeming ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Gift className="h-4 w-4" />
            )}
            立即兑换
          </Button>
        </div>
      </section>
    </div>
  );
}
