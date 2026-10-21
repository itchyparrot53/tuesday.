import type { FastifyInstance } from 'fastify';
import type { z } from 'zod';
import type { AiFeature } from '../../shared/ai';
import { AppError } from '../lib/errors';

function parseJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  const candidate = start >= 0 && end > start ? text.slice(start, end + 1) : text;
  return JSON.parse(candidate);
}

export async function generateStructured<T>(
  app: FastifyInstance,
  opts: {
    userId: number;
    feature: AiFeature;
    system: string;
    user: string;
    schema: z.ZodType<T>;
    validate?: (value: T) => string | null;
  },
): Promise<T> {
  const route = app.ai.modelFor(opts.feature);
  let error = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await app.ai.chat(opts.userId, opts.feature, {
      model: route.model,
      json: true,
      temperature: 0.1,
      messages: [
        { role: 'system', content: opts.system },
        { role: 'user', content: opts.user },
        ...(attempt > 0
          ? [
              {
                role: 'user' as const,
                content: `Your previous reply was invalid: ${error}. Reply again with only the corrected JSON.`,
              },
            ]
          : []),
      ],
    });
    try {
      const parsed = parseJson(result.content);
      const value = opts.schema.parse(parsed);
      const extra = opts.validate?.(value) ?? null;
      if (extra) throw new Error(extra);
      return value;
    } catch (caught) {
      error = caught instanceof Error ? caught.message : 'invalid JSON';
    }
  }
  throw new AppError(422, 'ai_invalid_output', 'The AI reply could not be used. Try rephrasing.');
}
