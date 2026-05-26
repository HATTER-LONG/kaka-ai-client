import type { Provider, VisibleApps } from "@/types";
import type { AppId, AwangAuthPayload } from "@/lib/api";

export const AWANG_PROVIDER_TYPE = "awang_ai";
export const AWANG_OFFICIAL_PROVIDER_TYPE = "awang_official";

export const AWANG_MANAGED_APP_IDS: AppId[] = [
  "claude",
  "claude-desktop",
  "codex",
  "gemini",
  "opencode",
  "openclaw",
  "hermes",
];
export const AWANG_PROXY_APP_IDS: AppId[] = ["claude", "codex"];

export const AWANG_VISIBLE_APPS: VisibleApps = {
  claude: true,
  "claude-desktop": true,
  codex: true,
  gemini: true,
  opencode: true,
  openclaw: true,
  hermes: true,
};

export function getAwangProviderId(appId: AppId): string {
  return `awang-ai-${appId}`;
}

export function getOfficialProviderId(appId: AppId): string {
  if (appId === "claude-desktop") {
    return "claude-desktop-official";
  }
  return `official-${appId}`;
}

export function isAwangSupportedApp(appId: AppId): boolean {
  return AWANG_MANAGED_APP_IDS.includes(appId);
}

export function isAwangManagedProvider(provider: Provider): boolean {
  return (
    provider.meta?.providerType === AWANG_PROVIDER_TYPE ||
    provider.id.startsWith("awang-ai-")
  );
}

const isBlank = (value: unknown): boolean =>
  typeof value !== "string" || value.trim() === "";

export function isOfficialChoiceProvider(
  provider: Provider,
  appId: AppId,
): boolean {
  if (provider.meta?.providerType === AWANG_OFFICIAL_PROVIDER_TYPE) {
    return true;
  }
  if (provider.category === "official") {
    return true;
  }
  if (provider.id === getOfficialProviderId(appId)) {
    return true;
  }

  const config = provider.settingsConfig as Record<string, any>;
  if (appId === "claude" || appId === "claude-desktop") {
    return isBlank(config?.env?.ANTHROPIC_BASE_URL);
  }
  if (appId === "codex") {
    return isBlank(config?.auth?.OPENAI_API_KEY) && isBlank(config?.config);
  }
  if (appId === "gemini") {
    return (
      isBlank(config?.env?.GEMINI_API_KEY) &&
      isBlank(config?.env?.GOOGLE_GEMINI_BASE_URL)
    );
  }

  return false;
}

export function isManagedChoiceProvider(
  provider: Provider,
  appId: AppId,
): boolean {
  return (
    isAwangManagedProvider(provider) ||
    isOfficialChoiceProvider(provider, appId)
  );
}

function apiBaseUrl(payload: AwangAuthPayload): string {
  const base =
    payload.apiBaseUrl || payload.publicBaseUrl || "https://api.mcorgai.com";
  const trimmed = base.trim().replace(/\/+$/, "");
  return trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`;
}

function publicBaseUrl(payload: AwangAuthPayload): string {
  const base = payload.publicBaseUrl || "https://api.mcorgai.com";
  return base.trim().replace(/\/+$/, "");
}

function tomlString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function commonMeta(appId: AppId) {
  return {
    providerType: AWANG_PROVIDER_TYPE,
    isPartner: true,
    awangApp: appId,
  };
}

export interface AwangModelOption {
  id: string;
  name: string;
  contextWindow?: number;
}

function normalizeModelOption(value: unknown): AwangModelOption | null {
  if (typeof value === "string") {
    const id = value.trim();
    return id ? { id, name: id } : null;
  }

  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const rawId = record.id ?? record.model ?? record.value ?? record.name;
  if (typeof rawId !== "string" || !rawId.trim()) return null;

  const id = rawId.trim();
  const rawName = record.displayName ?? record.label ?? record.name;
  const contextWindow =
    typeof record.contextWindow === "number"
      ? record.contextWindow
      : typeof record.context_window === "number"
        ? record.context_window
        : undefined;

  return {
    id,
    name: typeof rawName === "string" && rawName.trim() ? rawName.trim() : id,
    contextWindow,
  };
}

export function getAwangModels(payload?: AwangAuthPayload | null): AwangModelOption[] {
  const raw =
    payload?.models ?? payload?.modelList ?? payload?.availableModels ?? null;
  let modelSource = raw;
  if (modelSource && typeof modelSource === "object" && !Array.isArray(modelSource)) {
    const record = modelSource as Record<string, unknown>;
    if (Array.isArray(record.data)) {
      modelSource = record.data;
    } else if (Array.isArray(record.models)) {
      modelSource = record.models;
    } else if (record.data && typeof record.data === "object") {
      const data = record.data as Record<string, unknown>;
      modelSource = Array.isArray(data.models)
        ? data.models
        : Array.isArray(data.items)
          ? data.items
          : modelSource;
    }
  }

  const candidates = Array.isArray(modelSource)
    ? modelSource
    : modelSource && typeof modelSource === "object"
      ? Object.entries(modelSource as Record<string, unknown>).map(([id, value]) => {
          if (value && typeof value === "object") {
            return { id, ...(value as Record<string, unknown>) };
          }
          return id;
        })
      : [];

  const seen = new Set<string>();
  return candidates
    .map(normalizeModelOption)
    .filter((model): model is AwangModelOption => Boolean(model))
    .filter((model) => {
      if (seen.has(model.id)) return false;
      seen.add(model.id);
      return true;
    });
}

export function buildAwangProvider(
  appId: AppId,
  payload: AwangAuthPayload,
  selectedModelId: string,
): Provider {
  const now = Date.now();
  const token = payload.apiKey;
  const baseUrl = apiBaseUrl(payload);
  const websiteUrl = publicBaseUrl(payload);
  const claudeBaseUrl = websiteUrl;
  const awangModels = getAwangModels(payload);
  const selectedModel = awangModels.find((model) => model.id === selectedModelId);
  if (!selectedModel) {
    throw new Error("卡卡AI后台没有返回可用模型，无法同步配置");
  }
  const selectedModelName = selectedModel.name || selectedModel.id;
  const name = "卡卡AI接口";

  if (appId === "claude") {
    return {
      id: getAwangProviderId(appId),
      name,
      websiteUrl,
      category: "aggregator",
      settingsConfig: {
        env: {
          ANTHROPIC_BASE_URL: claudeBaseUrl,
          ANTHROPIC_AUTH_TOKEN: token,
          ANTHROPIC_MODEL: selectedModel.id,
          ANTHROPIC_DEFAULT_HAIKU_MODEL: selectedModel.id,
          ANTHROPIC_DEFAULT_SONNET_MODEL: selectedModel.id,
          ANTHROPIC_DEFAULT_OPUS_MODEL: selectedModel.id,
        },
      },
      meta: {
        ...commonMeta(appId),
        apiFormat: "openai_responses",
      },
      icon: "openai",
      iconColor: "#10A37F",
      createdAt: now,
      sortIndex: 1,
    };
  }

  if (appId === "codex") {
    const providerName = "awang_ai";
    const config = `model_provider = "${providerName}"
model = "${tomlString(selectedModel.id)}"
model_reasoning_effort = "high"
disable_response_storage = true

[model_providers.${providerName}]
name = "卡卡AI"
base_url = "${tomlString(baseUrl)}"
wire_api = "responses"
requires_openai_auth = true`;

    return {
      id: getAwangProviderId(appId),
      name,
      websiteUrl,
      category: "aggregator",
      settingsConfig: {
        auth: {
          OPENAI_API_KEY: token,
        },
        config,
      },
      meta: commonMeta(appId),
      icon: "openai",
      iconColor: "#10A37F",
      createdAt: now,
      sortIndex: 1,
    };
  }

  if (appId === "gemini") {
    return {
      id: getAwangProviderId(appId),
      name,
      websiteUrl,
      category: "aggregator",
      settingsConfig: {
        env: {
          GOOGLE_GEMINI_BASE_URL: baseUrl,
          GEMINI_API_KEY: token,
          GEMINI_MODEL: selectedModel.id,
        },
      },
      meta: commonMeta(appId),
      icon: "openai",
      iconColor: "#10A37F",
      createdAt: now,
      sortIndex: 1,
    };
  }

  if (appId === "claude-desktop") {
    return {
      id: getAwangProviderId(appId),
      name,
      websiteUrl,
      category: "aggregator",
      settingsConfig: {
        env: {
          ANTHROPIC_BASE_URL: baseUrl,
          ANTHROPIC_AUTH_TOKEN: token,
        },
      },
      meta: {
        ...commonMeta(appId),
        claudeDesktopMode: "proxy",
        apiFormat: "openai_responses",
        claudeDesktopModelRoutes: {
          "claude-sonnet-4-6": {
            model: selectedModel.id,
            displayName: selectedModelName,
          },
          "claude-opus-4-7": {
            model: selectedModel.id,
            displayName: selectedModelName,
          },
          "claude-haiku-4-5": {
            model: selectedModel.id,
            displayName: selectedModelName,
          },
        },
      },
      icon: "openai",
      iconColor: "#10A37F",
      createdAt: now,
      sortIndex: 1,
    };
  }

  if (appId === "opencode") {
    return {
      id: getAwangProviderId(appId),
      name,
      websiteUrl,
      category: "aggregator",
      settingsConfig: {
        npm: "@ai-sdk/openai-compatible",
        name: "kaka_ai",
        options: {
          baseURL: baseUrl,
          apiKey: token,
          setCacheKey: true,
        },
        models: Object.fromEntries(
          awangModels.map((model) => [model.id, { name: model.name }]),
        ),
      },
      meta: commonMeta(appId),
      icon: "openai",
      iconColor: "#10A37F",
      createdAt: now,
      sortIndex: 1,
    };
  }

  if (appId === "openclaw") {
    return {
      id: getAwangProviderId(appId),
      name,
      websiteUrl,
      category: "aggregator",
      settingsConfig: {
        baseUrl,
        apiKey: token,
        api: "openai-responses",
        models: awangModels.map((model) => ({
          id: model.id,
          name: model.name,
          contextWindow: model.contextWindow,
          input: ["text", "image"],
        })),
      },
      meta: commonMeta(appId),
      icon: "openai",
      iconColor: "#10A37F",
      createdAt: now,
      sortIndex: 1,
    };
  }

  return {
    id: getAwangProviderId(appId),
    name,
    websiteUrl,
    category: "aggregator",
    settingsConfig: {
      name: "kaka_ai",
      base_url: baseUrl,
      api_key: token,
      api_mode: "codex_responses",
      models: awangModels.map((model) => ({
        id: model.id,
        name: model.name,
        context_length: model.contextWindow,
      })),
    },
    meta: commonMeta(appId),
    icon: "openai",
    iconColor: "#10A37F",
    createdAt: now,
    sortIndex: 1,
  };
}

export function buildOfficialProvider(appId: AppId): Provider {
  const now = Date.now();
  const common = {
    id: getOfficialProviderId(appId),
    name: "官方接口",
    category: "official" as const,
    meta: { providerType: AWANG_OFFICIAL_PROVIDER_TYPE },
    createdAt: now,
    sortIndex: 0,
  };

  if (appId === "codex") {
    return {
      ...common,
      websiteUrl: "https://chatgpt.com/codex",
      settingsConfig: {
        auth: {},
        config: "",
      },
      icon: "openai",
      iconColor: "#00A67E",
    };
  }

  if (appId === "gemini") {
    return {
      ...common,
      websiteUrl: "https://aistudio.google.com",
      settingsConfig: {
        env: {},
      },
      icon: "gemini",
      iconColor: "#4285F4",
    };
  }

  if (appId === "opencode") {
    return {
      ...common,
      websiteUrl: "https://opencode.ai",
      settingsConfig: {
        npm: "@ai-sdk/anthropic",
        name: "anthropic",
        options: {},
        models: {},
      },
      icon: "anthropic",
      iconColor: "#D4915D",
    };
  }

  if (appId === "openclaw") {
    return {
      ...common,
      websiteUrl: "https://github.com/openclaw/openclaw",
      settingsConfig: {
        baseUrl: "",
        apiKey: "",
        api: "anthropic-messages",
        models: [],
      },
      icon: "anthropic",
      iconColor: "#D4915D",
    };
  }

  if (appId === "hermes") {
    return {
      ...common,
      websiteUrl: "https://github.com/haris-musa/excel-mcp-server",
      settingsConfig: {
        name: "anthropic",
        base_url: "",
        api_key: "",
        api_mode: "anthropic_messages",
        models: [],
      },
      icon: "anthropic",
      iconColor: "#D4915D",
    };
  }

  if (appId === "claude-desktop") {
    return {
      ...common,
      websiteUrl: "https://claude.ai/download",
      settingsConfig: {
        env: {},
      },
      meta: {
        ...common.meta,
        claudeDesktopMode: "direct",
        apiFormat: "anthropic",
      },
      icon: "anthropic",
      iconColor: "#D4915D",
    };
  }

  return {
    ...common,
    websiteUrl: "https://www.anthropic.com/claude-code",
    settingsConfig: {
      env: {},
    },
    icon: "anthropic",
    iconColor: "#D4915D",
  };
}
