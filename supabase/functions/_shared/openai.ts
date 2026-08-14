import { sanitizeErrorMessage } from "./error.ts";

export interface AiConfig {
  provider: string;
  model: string;
  baseUrl: string;
  apiKeyPresent: boolean;
}

export function getEffectiveAiConfig(): AiConfig {
  const provider = Deno.env.get("AI_PROVIDER") || "openai";
  const model = Deno.env.get("AI_MODEL") || "gpt-4o-mini";
  const baseUrl = (Deno.env.get("AI_BASE_URL") || "https://api.openai.com/v1").replace(/\/+$/, "");
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  const apiKeyPresent = Boolean(apiKey && apiKey.trim().length > 0);

  return {
    provider,
    model,
    baseUrl,
    apiKeyPresent,
  };
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;
}

export interface CallAiOptions {
  messages: ChatMessage[];
  maxTokens?: number;
  timeoutMs?: number;
  maxRetries?: number;
  systemPrompt?: string;
}

export interface CallAiResult<T> {
  success: boolean;
  data: T | null;
  model: string;
  provider: string;
  errorReason: string | null;
  attempts: number;
}

export async function callOpenAiChatCompletions<T>(
  options: CallAiOptions,
  validateJson: (parsed: unknown) => T | null
): Promise<CallAiResult<T>> {
  const config = getEffectiveAiConfig();

  if (!config.apiKeyPresent) {
    return {
      success: false,
      data: null,
      model: config.model,
      provider: config.provider,
      errorReason: "unconfigured_api_key",
      attempts: 0,
    };
  }

  const apiKey = Deno.env.get("OPENAI_API_KEY")!;
  const endpoint = `${config.baseUrl}/chat/completions`;
  const timeoutMs = options.timeoutMs ?? 10000;
  const maxRetries = options.maxRetries ?? 2; // total up to 3 attempts

  const messages: ChatMessage[] = [];
  if (options.systemPrompt) {
    messages.push({ role: "system", content: options.systemPrompt });
  }
  messages.push(...options.messages);

  const requestBody = {
    model: config.model,
    messages,
    response_format: { type: "json_object" },
    max_completion_tokens: options.maxTokens ?? 1000,
    temperature: 0.2,
  };

  let attempt = 0;
  let lastErrorReason: string | null = null;

  while (attempt <= maxRetries) {
    attempt++;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const status = response.status;
        const errText = await response.text().catch(() => "");
        const cleanErr = sanitizeErrorMessage(errText);
        lastErrorReason = `http_${status}: ${cleanErr.slice(0, 100)}`;

        // Only retry safe transient status codes (429, 500, 502, 503, 504)
        const isTransient = status === 429 || (status >= 500 && status <= 504);
        if (!isTransient || attempt > maxRetries) {
          break;
        }

        // Backoff delay before retry
        const backoffMs = Math.min(200 * Math.pow(2, attempt - 1), 1000);
        const { promise, resolve } = Promise.withResolvers<void>();
        setTimeout(resolve, backoffMs);
        await promise;
        continue;
      }

      const jsonResponse = await response.json();
      const contentStr = jsonResponse?.choices?.[0]?.message?.content;
      if (!contentStr || typeof contentStr !== "string") {
        lastErrorReason = "empty_ai_response_content";
        break;
      }

      let parsedRaw: unknown;
      try {
        parsedRaw = JSON.parse(contentStr);
      } catch {
        lastErrorReason = "invalid_json_format";
        break;
      }

      const validated = validateJson(parsedRaw);
      if (!validated) {
        lastErrorReason = "schema_validation_failed";
        break;
      }

      return {
        success: true,
        data: validated,
        model: config.model,
        provider: config.provider,
        errorReason: null,
        attempts: attempt,
      };
    } catch (err: unknown) {
      const errObj = err instanceof Error ? err : new Error(String(err));
      const cleanMsg = sanitizeErrorMessage(errObj.message);

      if (errObj.name === "AbortError" || cleanMsg.includes("abort")) {
        lastErrorReason = `timeout_${timeoutMs}ms`;
      } else {
        lastErrorReason = `network_error: ${cleanMsg.slice(0, 100)}`;
      }

      // Retry network/timeout errors if attempts remain
      if (attempt <= maxRetries) {
        const backoffMs = Math.min(200 * Math.pow(2, attempt - 1), 1000);
        const { promise, resolve } = Promise.withResolvers<void>();
        setTimeout(resolve, backoffMs);
        await promise;
        continue;
      }
      break;
    }
  }

  return {
    success: false,
    data: null,
    model: config.model,
    provider: config.provider,
    errorReason: lastErrorReason || "ai_execution_failed",
    attempts: attempt,
  };
}
