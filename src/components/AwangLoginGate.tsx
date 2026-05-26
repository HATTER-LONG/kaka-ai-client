import { useEffect, useRef, useState } from "react";
import type React from "react";
import { Eye, EyeOff, Loader2, Lock, Mail, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { awangApi, type AwangPublicSettings } from "@/lib/api";
import { extractErrorMessage } from "@/utils/errorUtils";
import {
  loadStoredAccount,
  saveStoredAccount,
  syncManagedProviders,
} from "@/components/settings/AwangAccountSection";

declare global {
  interface Window {
    turnstile?: {
      render: (
        element: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          "expired-callback": () => void;
          "error-callback": () => void;
        },
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
  }
}

interface AwangLoginGateProps {
  children: React.ReactNode;
  onLoginSuccess?: () => void;
}

function TurnstileBox({
  siteKey,
  onToken,
}: {
  siteKey: string;
  onToken: (token: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string>();

  useEffect(() => {
    let cancelled = false;

    const render = () => {
      if (cancelled || !containerRef.current || !window.turnstile) return;
      if (widgetIdRef.current) {
        window.turnstile.remove(widgetIdRef.current);
      }
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        callback: onToken,
        "expired-callback": () => onToken(""),
        "error-callback": () => onToken(""),
      });
    };

    if (window.turnstile) {
      render();
    } else {
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
      script.async = true;
      script.defer = true;
      script.onload = render;
      document.head.appendChild(script);
    }

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
      }
    };
  }, [onToken, siteKey]);

  return <div ref={containerRef} className="min-h-[65px]" />;
}

export function AwangLoginGate({
  children,
  onLoginSuccess,
}: AwangLoginGateProps) {
  const [isReady, setIsReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [settings, setSettings] = useState<AwangPublicSettings | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const bootstrap = async () => {
      const stored = loadStoredAccount();
      try {
        setSettings(await awangApi.getPublicSettings());
      } catch {
        setSettings(null);
      }

      if (!stored?.accessToken) {
        setIsReady(true);
        return;
      }

      try {
        const payload = await awangApi.getAccount(stored.accessToken);
        saveStoredAccount(payload);
        try {
          await syncManagedProviders(payload);
        } catch (syncError) {
          toast.error(
            extractErrorMessage(syncError) || "卡卡AI后台没有返回可用模型",
          );
        }
        setIsAuthenticated(true);
      } catch {
        setIsAuthenticated(false);
      } finally {
        setIsReady(true);
      }
    };

    void bootstrap();
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError("请输入邮箱和密码");
      return;
    }
    if (settings?.turnstileEnabled && !turnstileToken) {
      setError("请先完成人机验证");
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = await awangApi.login(
        trimmedEmail,
        password,
        settings?.turnstileEnabled ? turnstileToken : undefined,
      );
      if (remember) {
        saveStoredAccount(payload);
      }
      try {
        await syncManagedProviders(payload);
      } catch (syncError) {
        toast.error(
          extractErrorMessage(syncError) || "卡卡AI后台没有返回可用模型",
        );
      }
      setIsAuthenticated(true);
      onLoginSuccess?.();
      toast.success("已登录并自动配置卡卡AI接口");
    } catch (loginError) {
      window.turnstile?.reset();
      setTurnstileToken("");
      setError(extractErrorMessage(loginError) || "登录失败");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isReady) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isAuthenticated) {
    return <>{children}</>;
  }

  const siteName = settings?.siteName || "卡卡AI";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-[420px] rounded-lg border border-border bg-card p-6 shadow-sm"
      >
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">{siteName}客户端</h1>
            <p className="text-sm text-muted-foreground">
              登录后自动获取 SK 和接口地址
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="origin-email">邮箱</Label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="origin-email"
                className="pl-9"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={isSubmitting}
                autoFocus
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="origin-password">密码</Label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="origin-password"
                className="pl-9 pr-9"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={isSubmitting}
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                onClick={() => setShowPassword((value) => !value)}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          {settings?.turnstileEnabled && settings.turnstileSiteKey ? (
            <TurnstileBox
              siteKey={settings.turnstileSiteKey}
              onToken={setTurnstileToken}
            />
          ) : null}

          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Checkbox
              checked={remember}
              onCheckedChange={(checked) => setRemember(checked === true)}
            />
            记住登录状态
          </label>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <Button
            type="submit"
            className="w-full"
            disabled={
              isSubmitting || (settings?.turnstileEnabled && !turnstileToken)
            }
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="h-4 w-4" />
            )}
            登录并配置
          </Button>
        </div>
      </form>
    </div>
  );
}
