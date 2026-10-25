import Anthropic from '@anthropic-ai/sdk';
import { browser } from 'wxt/browser';
import { AI_OUTPUT_SCHEMA, AI_SYSTEM_PROMPT, type AiReply } from '@stylus/shared';

export const MODEL = 'claude-opus-5-5';
export const SETTINGS_KEY = 'ai:settings';

/** `baseUrl` is for proxies and tests; normally unset. */
export type AiSettings = { apiKey?: string; baseUrl?: string };

export type AiTurn = { prompt: string; reply: AiReply };
export type AiRequest = { prompt: string; context: string; history?: AiTurn[] };
export type AiErrorCode = 'no-key' | 'auth' | 'rate-limit' | 'refusal' | 'truncated' | 'network' | 'bad-output' | 'api';
export type AiResult = { ok: true; reply: AiReply; model: string } | { ok: false; code: AiErrorCode; error: string };

export async function getAiSettings(): Promise<AiSettings> {
  return ((await browser.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY] as AiSettings | undefined) ?? {};
}

const fail = (code: AiErrorCode, error: string): AiResult => ({ ok: false, code, error });

function userTurn(context: string, prompt: string): Anthropic.Beta.BetaMessageParam {
  return { role: 'user', content: `${context}\n\n<request>\n${prompt}\n</request>` };
}

/** Ask Claude for edits. Runs in the background service worker, with the user's own API key. */
export async function requestEdits(req: AiRequest): Promise<AiResult> {
  const { apiKey, baseUrl } = await getAiSettings();
  if (!apiKey) return fail('no-key', 'Add your Anthropic API key to use AI edits.');

  const client = new Anthropic({
    apiKey,
    baseURL: baseUrl || undefined,
    // The key belongs to the user and lives only in this extension's local storage.
    dangerouslyAllowBrowser: true,
    maxRetries: 1,
    timeout: 120_000,
  });

  // Follow-ups ("make it darker") replay earlier turns so the model can refine its last answer.
  const messages: Anthropic.Beta.BetaMessageParam[] = [];
  for (const turn of req.history ?? []) {
    messages.push(userTurn('', turn.prompt), { role: 'assistant', content: JSON.stringify(turn.reply) });
  }
  messages.push(userTurn(req.context, req.prompt));

  try {
    const res = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      // Re-run a declined request on Anthropic's recommended fallback model instead of failing.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: AI_SYSTEM_PROMPT,
      output_config: {
        effort: 'medium',
        format: { type: 'json_schema', schema: AI_OUTPUT_SCHEMA as unknown as Record<string, unknown> },
      },
      messages,
    });

    if (res.stop_reason === 'refusal') return fail('refusal', 'Claude declined this request. Try rephrasing it.');
    if (res.stop_reason === 'max_tokens') return fail('truncated', 'The answer was too long. Try a smaller request or select one element.');

    const text = res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
    let reply: AiReply;
    try {
      reply = JSON.parse(text) as AiReply;
    } catch {
      return fail('bad-output', 'Claude returned something Stylus could not read. Try again.');
    }
    if (!Array.isArray(reply?.edits)) return fail('bad-output', 'Claude returned no edits. Try again.');
    return { ok: true, reply, model: res.model };
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) return fail('auth', 'That API key was rejected. Check it in the AI bar.');
    if (err instanceof Anthropic.PermissionDeniedError) return fail('auth', 'This API key does not have access to the model.');
    if (err instanceof Anthropic.RateLimitError) return fail('rate-limit', 'Rate limited by the API. Wait a moment and try again.');
    if (err instanceof Anthropic.APIConnectionError) return fail('network', 'Could not reach the Anthropic API. Check your connection.');
    if (err instanceof Anthropic.APIError) return fail('api', `API error ${err.status ?? ''}: ${err.message}`.trim());
    return fail('api', err instanceof Error ? err.message : String(err));
  }
}
