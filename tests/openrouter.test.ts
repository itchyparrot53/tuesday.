import { expect, test } from 'vitest';
import { OpenRouterClient, OpenRouterError } from '../server/ai/openrouter';
import { fakeOpenRouter } from './helpers';

test('chat returns content, usage and the recorded request body', async () => {
  const fake = fakeOpenRouter([{ text: 'hi', cost: 0.0001 }]);
  const client = new OpenRouterClient('test-key', 'http://localhost', fake);
  const result = await client.chat({
    model: 'x',
    messages: [{ role: 'user', content: 'hello' }],
  });
  expect(result.content).toBe('hi');
  expect(result.usage?.cost).toBe(0.0001);
  expect(fake.calls[0].model).toBe('x');
  expect(fake.calls[0].messages[0].content).toBe('hello');
});

test('stream handles split chunks, comments and a split tool call', async () => {
  const events = [
    ': OPENROUTER PROCESSING\n\n',
    `data: ${JSON.stringify({ choices: [{ delta: { content: 'Hel' } }] })}\n\n`,
    `data: ${JSON.stringify({ choices: [{ delta: { content: 'lo' } }] })}\n\n`,
    `data: ${JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id: 'call_1',
                type: 'function',
                function: { name: 'create_item' },
              },
            ],
          },
        },
      ],
    })}\n\n`,
    `data: ${JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: [{ index: 0, function: { arguments: '{"boardId":' } }],
          },
        },
      ],
    })}\n\n`,
    `data: ${JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: [{ index: 0, function: { arguments: '1}' } }],
          },
          finish_reason: 'tool_calls',
        },
      ],
    })}\n\n`,
    `data: ${JSON.stringify({
      choices: [],
      usage: { prompt_tokens: 3, completion_tokens: 2, cost: 0.0002 },
      model: 'test/model',
    })}\n\n`,
    'data: [DONE]\n\n',
  ].join('');
  const split = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      const bytes = encoder.encode(events);
      for (let i = 0; i < bytes.length; i += 7) {
        controller.enqueue(bytes.slice(i, i + 7));
      }
      controller.close();
    },
  });
  const fake = Object.assign(
    async () =>
      new Response(split, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
    { calls: [] as any[] },
  ) as unknown as typeof fetch;
  const client = new OpenRouterClient('test-key', 'http://localhost', fake);

  let text = '';
  let final: any = null;
  for await (const chunk of client.stream({
    model: 'x',
    messages: [{ role: 'user', content: 'go' }],
  })) {
    if (chunk.type === 'text') text += chunk.delta;
    else final = chunk.result;
  }
  expect(text).toBe('Hello');
  expect(final.toolCalls).toHaveLength(1);
  expect(final.toolCalls[0].function.name).toBe('create_item');
  expect(JSON.parse(final.toolCalls[0].function.arguments)).toEqual({ boardId: 1 });
  expect(final.usage.cost).toBe(0.0002);
  expect(final.model).toBe('test/model');
});

test('a non-200 response throws OpenRouterError with the provider message', async () => {
  const fake = (async () =>
    new Response(JSON.stringify({ error: { message: 'bad key' } }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch;
  const client = new OpenRouterClient('test-key', 'http://localhost', fake);
  await expect(
    client.chat({ model: 'x', messages: [{ role: 'user', content: 'hi' }] }),
  ).rejects.toMatchObject({ status: 401, message: 'bad key' });
  await expect(
    client.chat({ model: 'x', messages: [{ role: 'user', content: 'hi' }] }),
  ).rejects.toBeInstanceOf(OpenRouterError);
});
