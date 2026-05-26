import { ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { AwangAccountSection } from "@/components/settings/AwangAccountSection";

export function AuthCenterPanel() {
  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border/60 bg-card/60 p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <h3 className="text-base font-semibold">账号中心</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              只保留官方接口和卡卡AI接口，卡卡AI接口由登录账号自动同步。
            </p>
          </div>
          <Badge variant="secondary">卡卡AI客户端</Badge>
        </div>
      </section>

      <AwangAccountSection />
    </div>
  );
}
