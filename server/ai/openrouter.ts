import type { AiModel } from '../../shared/ai';

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ToolDef {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  tools?: ToolDef[];
  temperature?: number;
  max_tokens?: number;
  json?: boolean;
}

export interface EmbeddingResult {
  embeddings: number[][];
  usage: Usage | null;
}

export interface Usage {
  prompt_tokens: number;
  completion_tokens: number;
  cost?: number;
}

export interface ChatResult {
  content: string;
  toolCalls: ToolCall[];
  finishReason: string;
  usage: Usage | null;
  model: string;
}

export type StreamChunk = { type: 'text'; delta: string } | { type: 'final'; result: ChatResult };

export class OpenRouterError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'OpenRouterError';
  }
}

const BASE = 'https://openrouter.ai/api/v1';

export class OpenRouterClient {
  constructor(
    private apiKey: string | undefined,
    private appUrl: string,
    private fetchImpl: typeof fetch = fetch,
  ) {}

  get configured(): boolean {
    return !!this.apiKey;
  }

  private headers() {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': this.appUrl,
      'X-Title': 'Tuesday',
    };
  }

  private body(req: ChatRequest, stream: boolean) {
    return JSON.stringify({
      model: req.model,
      messages: req.messages,
      stream,
      usage: { include: true },
      ...(req.tools?.length ? { tools: req.tools, tool_choice: 'auto' } : {}),
      ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
      ...(req.max_tokens ? { max_tokens: req.max_tokens } : {}),
      ...(req.json ? { response_format: { type: 'json_object' } } : {}),
    });
  }

  async chat(req: ChatRequest): Promise<ChatResult> {
    const res = await this.fetchImpl(`${BASE}/chat/completions`, {
      method: 'POST',
      headers: this.headers(),
      body: this.body(req, false),
    });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok || data.error) {
      throw new OpenRouterError(
        res.status,
        data?.error?.message ?? `OpenRouter error ${res.status}`,
      );
    }
    const choice = data.choices?.[0];
    if (choice?.error) throw new OpenRouterError(502, choice.error.message ?? 'Provider error');
    return {
      content: choice?.message?.content ?? '',
      toolCalls: choice?.message?.tool_calls ?? [],
      finishReason: choice?.finish_reason ?? 'stop',
      usage: data.usage ?? null,
      model: data.model ?? req.model,
    };
  }

  async *stream(req: ChatRequest): AsyncGenerator<StreamChunk> {
    const res = await this.fetchImpl(`${BASE}/chat/completions`, {
      method: 'POST',
      headers: this.headers(),
      body: this.body(req, true),
    });
    if (!res.ok || !res.body) {
      const data: any = await res.json().catch(() => ({}));
      throw new OpenRouterError(
        res.status,
        data?.error?.message ?? `OpenRouter error ${res.status}`,
      );
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '',
      content = '',
      finish = 'stop',
      model = req.model;
    let usage: Usage | null = null;
    const calls = new Map<number, ToolCall>();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line || line.startsWith(':') || !line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') continue;
        let chunk: any;
        try {
          chunk = JSON.parse(payload);
        } catch {
          continue;
        }
        if (chunk.error) throw new OpenRouterError(502, chunk.error.message ?? 'Provider error');
        if (chunk.usage) usage = chunk.usage;
        if (chunk.model) model = chunk.model;
        const choice = chunk.choices?.[0];
        if (!choice) continue;
        if (choice.error) throw new OpenRouterError(502, choice.error.message ?? 'Provider error');
        const delta = choice.delta ?? {};
        if (delta.content) {
          content += delta.content;
          yield { type: 'text', delta: delta.content };
        }
        for (const tc of delta.tool_calls ?? []) {
          const idx: number = tc.index ?? 0;
          const cur = calls.get(idx) ?? {
            id: '',
            type: 'function' as const,
            function: { name: '', arguments: '' },
          };
          if (tc.id) cur.id = tc.id;
          if (tc.function?.name) cur.function.name += tc.function.name;
          if (tc.function?.arguments) cur.function.arguments += tc.function.arguments;
          calls.set(idx, cur);
        }
        if (choice.finish_reason) finish = choice.finish_reason;
      }
    }
    const toolCalls = [...calls.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([i, c]) => ({ ...c, id: c.id || `call_${i}` }));
    yield {
      type: 'final',
      result: { content, toolCalls, finishReason: finish, usage, model },
    };
  }

  async embed(model: string, inputs: string[]): Promise<EmbeddingResult> {
    const res = await this.fetchImpl(`${BASE}/embeddings`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ model, input: inputs, encoding_format: 'float' }),
    });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok || data.error) {
      throw new OpenRouterError(
        res.status,
        data?.error?.message ?? `OpenRouter error ${res.status}`,
      );
    }
    const embeddings = (data.data ?? [])
      .slice()
      .sort((a: { index?: number }, b: { index?: number }) => (a.index ?? 0) - (b.index ?? 0))
      .map((row: { embedding: number[] }) => row.embedding);
    return {
      embeddings,
      usage: data.usage
        ? {
            prompt_tokens: data.usage.prompt_tokens ?? 0,
            completion_tokens: 0,
            cost: data.usage.cost ?? 0,
          }
        : null,
    };
  }

  async listEmbeddingModels(): Promise<AiModel[]> {
    return this.listModels();
  }

  async listModels(): Promise<AiModel[]> {
    const res = await this.fetchImpl(`${BASE}/models`, { headers: this.headers() });
    if (!res.ok) throw new OpenRouterError(res.status, `OpenRouter error ${res.status}`);
    const data: any = await res.json();
    return (data.data ?? []).map((m: any) => ({
      id: m.id,
      name: m.name ?? m.id,
      contextLength: m.context_length ?? 0,
      promptPricePerM: Number(m.pricing?.prompt ?? 0) * 1_000_000,
      completionPricePerM: Number(m.pricing?.completion ?? 0) * 1_000_000,
      supportsTools:
        Array.isArray(m.supported_parameters) && m.supported_parameters.includes('tools'),
    }));
  }
}
