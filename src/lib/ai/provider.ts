/**
 * AI Provider abstraction — the ONLY place that talks to a model.
 * Backed by z-ai-web-dev-sdk (server-side only). Swap this implementation
 * to point at Mistral, a local SLM, or any other provider later.
 *
 * The provider NEVER sees or produces authoritative nutrition numbers.
 * Its job: perception (understand food), reasoning/ranking, explanation, localization.
 */
import ZAI from "z-ai-web-dev-sdk";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface VisionPart {
  type: "text" | "image_url";
  text?: string;
  image_url?: { url: string };
}

export interface AiResult {
  ok: boolean;
  content: string;
  latencyMs: number;
  error?: string;
}

export interface AiProvider {
  readonly name: string;
  chat(messages: ChatMessage[], opts?: { maxTokens?: number }): Promise<AiResult>;
  vision(prompt: string, imageDataUrl: string, opts?: { maxTokens?: number }): Promise<AiResult>;
}

function extractJson(content: string): string {
  // Models sometimes wrap JSON in ```json fences or prepend text — extract robustly.
  const trimmed = content.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) return fence[1].trim();
  const start = trimmed.search(/[[{]/);
  if (start === -1) return trimmed;
  const openChar = trimmed[start];
  const closeChar = openChar === "{" ? "}" : "]";
  let depth = 0;
  for (let i = start; i < trimmed.length; i++) {
    if (trimmed[i] === openChar) depth++;
    else if (trimmed[i] === closeChar) {
      depth--;
      if (depth === 0) return trimmed.slice(start, i + 1);
    }
  }
  return trimmed;
}

export function parseJsonSafe<T>(content: string): T | null {
  try {
    return JSON.parse(extractJson(content)) as T;
  } catch {
    return null;
  }
}

class ZAiProvider implements AiProvider {
  readonly name = "zai-slm";
  private static VISION_MODEL = "glm-4.6v";

  private async getClient() {
    return ZAI.create();
  }

  async chat(messages: ChatMessage[], _opts?: { maxTokens?: number }): Promise<AiResult> {
    const t0 = Date.now();
    try {
      const zai = await this.getClient();
      const completion = await zai.chat.completions.create({
        messages: messages.map((m) => ({ role: m.role === "system" ? "assistant" : m.role, content: m.content })),
        thinking: { type: "disabled" },
      });
      const content = completion.choices[0]?.message?.content ?? "";
      if (!content.trim()) {
        return { ok: false, content: "", latencyMs: Date.now() - t0, error: "empty_ai_response" };
      }
      return { ok: true, content, latencyMs: Date.now() - t0 };
    } catch (e) {
      return { ok: false, content: "", latencyMs: Date.now() - t0, error: String(e).slice(0, 300) };
    }
  }

  async vision(prompt: string, imageDataUrl: string, _opts?: { maxTokens?: number }): Promise<AiResult> {
    const t0 = Date.now();
    try {
      const zai = await this.getClient();
      const response = await zai.chat.completions.createVision({
        model: ZAiProvider.VISION_MODEL,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: imageDataUrl } },
            ],
          },
        ],
        thinking: { type: "disabled" },
      });
      const content = response.choices[0]?.message?.content ?? "";
      if (!content.trim()) {
        return { ok: false, content: "", latencyMs: Date.now() - t0, error: "empty_ai_response" };
      }
      return { ok: true, content, latencyMs: Date.now() - t0 };
    } catch (e) {
      return { ok: false, content: "", latencyMs: Date.now() - t0, error: String(e).slice(0, 300) };
    }
  }
}

/** Singleton provider instance — replaceable via env in future (AI_PROVIDER=local_slm etc.) */
let provider: AiProvider | null = null;

export function getAiProvider(): AiProvider {
  if (!provider) provider = new ZAiProvider();
  return provider;
}
