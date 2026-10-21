import type { FastifyInstance } from 'fastify';
import type { User } from '../shared/types';
import { buildApp } from '../server/app';
import { loadConfig, type Config } from '../server/config';

export async function createTestApp(
  opts: { aiFetch?: typeof fetch; config?: Partial<Config>; dbPath?: string } = {},
): Promise<FastifyInstance> {
  return buildApp({
    config: {
      ...loadConfig(),
      aiFake: true,
      openrouterApiKey: 'test-key',
      ...opts.config,
    },
    dbPath: opts.dbPath ?? ':memory:',
    aiFetch: opts.aiFetch,
  });
}

export const H = { 'x-requested-with': 'tuesday' };

export function cookieFrom(res: { headers: Record<string, unknown> }): string {
  const raw = res.headers['set-cookie'];
  const value = Array.isArray(raw) ? String(raw[0]) : String(raw ?? '');
  return value.split(';')[0];
}

export async function setupOwner(app: FastifyInstance): Promise<{ cookie: string; user: User }> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/setup',
    headers: H,
    payload: {
      orgName: 'Acme',
      name: 'Olivia Owner',
      email: 'owner@acme.test',
      password: 'password123',
    },
  });
  return { cookie: cookieFrom(res), user: res.json().user };
}

export async function inviteAndJoin(
  app: FastifyInstance,
  ownerCookie: string,
  role: 'admin' | 'member' | 'viewer',
  email: string,
): Promise<{ cookie: string; user: User }> {
  const invite = await app.inject({
    method: 'POST',
    url: '/api/invites',
    headers: { ...H, cookie: ownerCookie },
    payload: { role },
  });
  const token = invite.json().invite.token as string;
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/accept-invite',
    headers: H,
    payload: { token, name: email.split('@')[0], email, password: 'password123' },
  });
  return { cookie: cookieFrom(res), user: res.json().user };
}

export async function createSpace(
  app: FastifyInstance,
  cookie: string,
  name = 'Engineering',
  extra: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/workspaces',
    headers: { ...H, cookie },
    payload: { name, ...extra },
  });
  return res.json().workspace;
}

export async function createBoard(
  app: FastifyInstance,
  cookie: string,
  workspaceId: number,
  name = 'Board',
): Promise<any> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/boards',
    headers: { ...H, cookie },
    payload: { workspaceId, name },
  });
  return res.json();
}

export interface FakeReply {
  text?: string;
  toolCalls?: { name: string; args: unknown }[];
  cost?: number;
}

export function fakeOpenRouter(replies: FakeReply[]): typeof fetch & { calls: any[] } {
  const calls: any[] = [];
  const impl = async (input: any, init?: any): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.url;
    if (url.includes('/models')) {
      return new Response(
        JSON.stringify({
          data: [
            {
              id: 'test/model',
              name: 'Test',
              context_length: 1000,
              pricing: { prompt: '0.000001', completion: '0.000002' },
              supported_parameters: ['tools'],
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    calls.push(body);
    const reply = replies.shift();
    if (!reply) throw new Error('fakeOpenRouter: no replies left');
    const cost = reply.cost ?? 0.001;
    if (body.stream) {
      const parts: string[] = [];
      const text = reply.text ?? '';
      for (let i = 0; i < text.length; i += 5) {
        parts.push(
          `data: ${JSON.stringify({ choices: [{ delta: { content: text.slice(i, i + 5) } }] })}\n\n`,
        );
      }
      (reply.toolCalls ?? []).forEach((call, index) => {
        parts.push(
          `data: ${JSON.stringify({
            choices: [
              {
                delta: {
                  tool_calls: [
                    {
                      index,
                      id: `call_${index}`,
                      type: 'function',
                      function: { name: call.name, arguments: JSON.stringify(call.args) },
                    },
                  ],
                },
                finish_reason: 'tool_calls',
              },
            ],
          })}\n\n`,
        );
      });
      parts.push(
        `data: ${JSON.stringify({
          choices: [],
          usage: { prompt_tokens: 10, completion_tokens: 5, cost },
        })}\n\n`,
      );
      parts.push('data: [DONE]\n\n');
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          for (const part of parts) controller.enqueue(encoder.encode(part));
          controller.close();
        },
      });
      return new Response(stream, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      });
    }
    const toolCalls = reply.toolCalls?.map((call, index) => ({
      id: `call_${index}`,
      type: 'function',
      function: { name: call.name, arguments: JSON.stringify(call.args) },
    }));
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: reply.text ?? '',
              ...(toolCalls?.length ? { tool_calls: toolCalls } : {}),
            },
            finish_reason: toolCalls?.length ? 'tool_calls' : 'stop',
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5, cost },
        model: 'test/model',
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };
  return Object.assign(impl, { calls }) as unknown as typeof fetch & { calls: any[] };
}
