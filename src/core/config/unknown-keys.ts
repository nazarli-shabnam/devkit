import { z } from 'zod';
import { DevEnvConfigSchema } from '../../types/config';

export interface UnknownKey {
  /** Dotted path of the object that contains the key, '' for the top level (array items as `[0]`). */
  path: string;
  key: string;
  suggestion?: string;
}

function editDistance(a: string, b: string): number {
  const dp: number[] = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

function closest(key: string, candidates: string[]): string | undefined {
  let best: string | undefined;
  let bestDistance = Infinity;
  for (const candidate of candidates) {
    const distance = editDistance(key.toLowerCase(), candidate.toLowerCase());
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return bestDistance <= Math.max(2, Math.floor((best?.length ?? 0) / 3)) ? best : undefined;
}

function unwrap(schema: z.ZodTypeAny): z.ZodTypeAny {
  let current = schema;
  for (;;) {
    if (current instanceof z.ZodOptional || current instanceof z.ZodNullable) current = current.unwrap();
    else if (current instanceof z.ZodDefault) current = current.removeDefault();
    else if (current instanceof z.ZodEffects) current = current.innerType();
    else return current;
  }
}

function collect(schema: z.ZodTypeAny, value: unknown, path: string, out: UnknownKey[]): void {
  const inner = unwrap(schema);
  if (inner instanceof z.ZodObject) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return;
    const shape = inner.shape as Record<string, z.ZodTypeAny>;
    const known = Object.keys(shape);
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (known.includes(key)) {
        collect(shape[key], child, path ? `${path}.${key}` : key, out);
      } else {
        out.push({ path, key, suggestion: closest(key, known) });
      }
    }
  } else if (inner instanceof z.ZodArray && Array.isArray(value)) {
    value.forEach((item, i) => collect(inner.element, item, `${path}[${i}]`, out));
  }
}

/**
 * Keys in the raw config that the schema does not know. Zod strips these silently,
 * which turns a typo (`dependancies:`) into a "valid" config that does nothing.
 */
export function findUnknownKeys(rawConfig: unknown): UnknownKey[] {
  const out: UnknownKey[] = [];
  collect(DevEnvConfigSchema, rawConfig, '', out);
  return out;
}

export function formatUnknownKey(u: UnknownKey): string {
  const where = u.path ? ` in "${u.path}"` : '';
  const hint = u.suggestion ? ` Did you mean "${u.suggestion}"?` : '';
  return `Unknown config key "${u.key}"${where} is ignored.${hint}`;
}
