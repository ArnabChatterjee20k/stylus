import { z } from 'zod';

/** Where an op applies beyond the plain selector: a breakpoint and/or a forced state. */
export const ScopeSchema = z.object({
  media: z.string().optional(),
  state: z.enum(['hover', 'focus', 'active']).optional(),
});
export type Scope = z.infer<typeof ScopeSchema>;

/** Minimal description of the element an op was made on; used for re-matching and codebase export. */
export const FingerprintSchema = z.object({
  tag: z.string(),
  id: z.string().optional(),
  classes: z.array(z.string()).default([]),
  text: z.string().optional(),
  testId: z.string().optional(),
});
export type Fingerprint = z.infer<typeof FingerprintSchema>;

const base = {
  id: z.string(),
  by: z.enum(['user', 'ai', 'agent']).default('user'),
  at: z.number(),
  disabled: z.boolean().optional(),
  scope: ScopeSchema.optional(),
  fingerprint: FingerprintSchema.optional(),
};

export const PRESETS = ['dark', 'sepia', 'dim', 'grayscale', 'warm', 'contrast', 'reading'] as const;
export type PresetName = (typeof PRESETS)[number];

export const EditOpSchema = z.discriminatedUnion('kind', [
  z.object({
    ...base,
    kind: z.literal('style'),
    selector: z.string(),
    props: z.record(z.string(), z.string()),
    before: z.record(z.string(), z.string()).optional(),
  }),
  z.object({
    ...base,
    kind: z.literal('hide'),
    selector: z.string(),
    mode: z.enum(['display', 'visibility']).default('display'),
  }),
  z.object({
    ...base,
    kind: z.literal('text'),
    selector: z.string(),
    /** Plain text, or sanitized HTML when `html` is true (element had inline children). */
    text: z.string(),
    html: z.boolean().optional(),
    before: z.string().optional(),
  }),
  z.object({ ...base, kind: z.literal('rawCss'), css: z.string() }),
  z.object({ ...base, kind: z.literal('preset'), name: z.enum(PRESETS) }),
]);
export type EditOp = z.infer<typeof EditOpSchema>;
export type EditOpKind = EditOp['kind'];
export type OpOf<K extends EditOpKind> = Extract<EditOp, { kind: K }>;

export const SiteRuleSchema = z.object({
  origin: z.string(),
  enabled: z.boolean().default(true),
  ops: z.array(EditOpSchema).default([]),
  updatedAt: z.number().default(0),
});
export type SiteRule = z.infer<typeof SiteRuleSchema>;

export const emptyRule = (origin: string): SiteRule => ({ origin, enabled: true, ops: [], updatedAt: 0 });

/** Parse untrusted data (storage, imports, agents) into a rule, dropping invalid ops instead of failing. */
export function parseRule(origin: string, data: unknown): SiteRule {
  const parsed = SiteRuleSchema.safeParse(data);
  if (parsed.success) return parsed.data;
  const raw = (data ?? {}) as { ops?: unknown[]; enabled?: boolean };
  const ops = (Array.isArray(raw.ops) ? raw.ops : []).flatMap((op) => {
    const r = EditOpSchema.safeParse(op);
    return r.success ? [r.data] : [];
  });
  return { origin, enabled: raw.enabled !== false, ops, updatedAt: Date.now() };
}

let counter = 0;
export const opId = () => `${Date.now().toString(36)}-${(counter++).toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

/** Ops that compile to CSS vs ones that mutate the DOM. */
export const isDomOp = (op: EditOp): op is OpOf<'text'> => op.kind === 'text';
