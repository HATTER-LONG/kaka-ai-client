import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AlertTriangle, Loader2, MonitorCog, XCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface RunningStartupTool {
  tool: string;
  label: string;
  pid: number;
  processName: string;
}

interface StartupToolGroup {
  key: string;
  label: string;
  processNames: string[];
  pids: number[];
}

function groupStartupTools(tools: RunningStartupTool[]): StartupToolGroup[] {
  const groups = new Map<string, StartupToolGroup>();

  for (const tool of tools) {
    const key = tool.tool || tool.label;
    const existing = groups.get(key);
    if (existing) {
      existing.pids.push(tool.pid);
      if (!existing.processNames.includes(tool.processName)) {
        existing.processNames.push(tool.processName);
      }
      continue;
    }

    groups.set(key, {
      key,
      label: tool.label,
      processNames: [tool.processName],
      pids: [tool.pid],
    });
  }

  return Array.from(groups.values()).map((group) => ({
    ...group,
    pids: [...group.pids].sort((a, b) => a - b),
  }));
}

export function StartupToolCheckDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [displayTools, setDisplayTools] = useState<RunningStartupTool[]>([]);
  const [isKilling, setIsKilling] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const groupedTools = useMemo(
    () => groupStartupTools(displayTools),
    [displayTools],
  );

  useEffect(() => {
    let cancelled = false;

    const checkRunningStartupTools = async () => {
      try {
        const runningTools = await invoke<RunningStartupTool[]>(
          "get_running_startup_tools",
        );
        if (cancelled || runningTools.length === 0) {
          return;
        }
        setDisplayTools(runningTools);
        setIsOpen(true);
      } catch (error) {
        console.error("检查已运行工具失败", error);
      }
    };

    void checkRunningStartupTools();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleKillProcesses = async () => {
    setIsKilling(true);
    setNotice(null);

    let latestTools: RunningStartupTool[] = [];
    try {
      latestTools = await invoke<RunningStartupTool[]>(
        "get_running_startup_tools",
      );
    } catch (error) {
      setNotice(
        `重新检查运行中工具失败：${String(error)}。请在系统工具栏托盘中手动关闭这些工具。`,
      );
      setIsKilling(false);
      return;
    }

    if (latestTools.length === 0) {
      setNotice(null);
      setIsKilling(false);
      setIsOpen(false);
      return;
    }

    setDisplayTools(latestTools);
    try {
      await invoke("kill_startup_tool_processes", {
        pids: latestTools.map((tool) => tool.pid),
      });
    } catch (error) {
      setNotice(
        `一键结束工具失败：${String(error)}。请在系统工具栏托盘中手动关闭这些工具。`,
      );
      setIsKilling(false);
      return;
    }

    setNotice(null);
    setIsKilling(false);
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent
        className="max-h-[min(640px,calc(100vh-32px))] w-[calc(100vw-32px)] max-w-[520px] overflow-hidden border-border bg-card p-0 shadow-2xl"
        zIndex="top"
        overlayClassName="bg-black/60"
      >
        <DialogHeader className="border-b border-border bg-card px-6 pb-4 pt-6">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
              <MonitorCog className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-xl font-semibold">
                检测到运行中的工具
              </DialogTitle>
              <DialogDescription className="mt-1.5 text-sm leading-6">
                这些工具正在后台运行。保持运行时，后续配置切换可能不会立即生效。
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
          <div className="space-y-2">
            {groupedTools.map((tool) => (
              <div
                key={tool.key}
                className="flex items-center gap-3 rounded-lg border border-border bg-muted/25 px-3.5 py-3"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-background text-muted-foreground">
                  <AlertTriangle className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {tool.label}
                  </div>
                  <div className="mt-1 text-xs leading-5 text-muted-foreground">
                    <span className="break-words">
                      PID {tool.pids.join(", ")}
                    </span>
                    <span className="mx-1.5">·</span>
                    <span className="break-words">
                      {tool.processNames.join(", ")}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <p className="text-sm leading-6 text-muted-foreground">
            你也可以选择暂不处理，稍后在系统托盘中手动退出这些工具。
          </p>

          {notice ? (
            <div className="flex gap-2 rounded-lg border border-destructive/25 bg-destructive/10 px-3.5 py-3 text-sm text-destructive">
              <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="leading-5">{notice}</span>
            </div>
          ) : null}
        </div>

        <DialogFooter className="shrink-0 border-t border-border bg-muted/20 px-6 py-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => setIsOpen(false)}
            disabled={isKilling}
          >
            暂不处理
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => void handleKillProcesses()}
            disabled={isKilling}
          >
            {isKilling ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <XCircle className="h-4 w-4" />
            )}
            一键结束
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
