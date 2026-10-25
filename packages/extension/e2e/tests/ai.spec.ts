import { createServer, type IncomingHttpHeaders } from 'node:http';
import { expect, test as base } from '../fixtures';

/**
 * The ⌘K AI bar, against a local stand-in for the Anthropic Messages API (set via the extension's
 * `baseUrl` setting). Each test queues the responses it wants and inspects the requests sent.
 */

type Recorded = { headers: IncomingHttpHeaders; body: Record<string, unknown> & { messages: { role: string; content: string }[] } };
type Canned = { status?: number; body: unknown };

class MockClaude {
  requests: Recorded[] = [];
  queue: Canned[] = [];
  constructor(readonly url: string) {}

  /** Queue a successful structured-output reply. */
  reply(summary: string, edits: Record<string, unknown>[], extra: Record<string, unknown> = {}) {
    const full = edits.map((e) => ({ kind: 'style', selector: '', declarations: [], text: '', css: '', preset: '', ...e }));
    this.queue.push({
      body: {
        id: `msg_${this.queue.length}`,
        type: 'message',
        role: 'assistant',
        model: 'claude-opus-5-5',
        content: [{ type: 'text', text: JSON.stringify({ summary, edits: full }) }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 100, output_tokens: 50 },
        ...extra,
      },
    });
  }

  error(status: number, type: string, message: string) {
    this.queue.push({ status, body: { type: 'error', error: { type, message } } });
  }
}

const test = base.extend<{ claude: MockClaude }>({
  claude: async ({ sw }, use) => {
    let mock!: MockClaude;
    const server = createServer((req, res) => {
      res.setHeader('access-control-allow-origin', '*');
      res.setHeader('access-control-allow-headers', '*');
      if (req.method === 'OPTIONS') return res.end();
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => {
        mock.requests.push({ headers: req.headers, body: JSON.parse(raw) });
        const next = mock.queue.shift() ?? { status: 500, body: { type: 'error', error: { type: 'api_error', message: 'no reply queued' } } };
        res.statusCode = next.status ?? 200;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(next.body));
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    mock = new MockClaude(`http://127.0.0.1:${(server.address() as { port: number }).port}`);
    await sw.evaluate((baseUrl) => chrome.storage.local.set({ 'ai:settings': { apiKey: 'sk-ant-test-key', baseUrl } }), mock.url);
    await use(mock);
    server.close();
  },
});

const bar = (stylus: { ui: (s: string) => import('@playwright/test').Locator }) => stylus.ui('.aibar');

test.describe('AI bar', () => {
  test.beforeEach(async ({ stylus }) => {
    await stylus.open();
    await stylus.edit();
  });

  test('asks for an API key first and stores it', async ({ stylus, sw, page }) => {
    await sw.evaluate(() => chrome.storage.local.remove('ai:settings'));
    await page.keyboard.press('Meta+k');
    await expect(bar(stylus)).toContainText('Connect Claude');
    await stylus.ui('.ai-key-input').fill('sk-ant-my-key');
    await stylus.ui('.ai-key-input').press('Enter');
    await expect(stylus.ui('.ai-input')).toBeVisible();
    expect(await sw.evaluate(async () => (await chrome.storage.local.get('ai:settings'))['ai:settings'])).toEqual({ apiKey: 'sk-ant-my-key' });
  });

  test('sends the request the way the API expects', async ({ stylus, claude, page }) => {
    await stylus.pick('#second');
    claude.reply('Darkened the card.', [{ selector: '#second', declarations: [{ property: 'background-color', value: '#111111' }] }]);
    await page.keyboard.press('Meta+k');
    await stylus.ui('.ai-input').fill('make this card dark');
    await stylus.ui('.ai-input').press('Enter');
    await expect(stylus.ui('.ai-preview')).toBeVisible();

    const [req] = claude.requests;
    // SDK 1.x sends API keys as a bearer token.
    expect(req.headers.authorization).toBe('Bearer sk-ant-test-key');
    expect(req.headers['anthropic-beta']).toContain('server-side-fallback-2026-07-01');
    expect(req.headers['anthropic-dangerous-direct-browser-access']).toBe('true');
    expect(req.body.model).toBe('claude-opus-5-5');
    expect(req.body.fallbacks).toBe('default');
    expect(req.body.output_config).toMatchObject({ effort: 'medium', format: { type: 'json_schema' } });
    expect(req.body).not.toHaveProperty('tool_choice');
    const content = req.body.messages.at(-1)!.content;
    expect(content).toContain('<selection selector="#second"');
    expect(content).toContain('background-color:');
    expect(content).toContain('<request>\nmake this card dark\n</request>');
  });

  test('previews without saving; Accept saves as one AI change', async ({ stylus, claude, page }) => {
    await stylus.pick('#second');
    claude.reply('Darkened the card and hid the sidebar.', [
      { selector: '#second', declarations: [{ property: 'background-color', value: '#111111' }, { property: 'color', value: '#eeeeee' }] },
      { kind: 'hide', selector: 'aside' },
    ]);
    await page.keyboard.press('Meta+k');
    await stylus.ui('.ai-input').fill('make this card dark');
    await stylus.ui('.ai-input').press('Enter');

    await expect(stylus.ui('.ai-summary')).toHaveText('Darkened the card and hid the sidebar.');
    await expect(stylus.ui('.ai-ops li')).toHaveCount(2);
    expect(await stylus.style('#second', 'background-color')).toBe('rgb(17, 17, 17)');
    expect(await stylus.style('aside', 'display')).toBe('none');
    await expect(stylus.ui('.overlay .pv')).toHaveCount(1); // the card is outlined; the hidden aside has no box
    expect((await stylus.stored())?.ops ?? []).toHaveLength(0); // nothing saved yet

    await stylus.ui('.ai-input').press('Enter'); // empty input + Enter = accept
    await expect(bar(stylus)).toHaveCount(0);
    await stylus.persisted((r) => r?.ops.length === 2 && r.ops.every((o) => (o as { by?: string }).by === 'ai'));
    await stylus.toolbarButton('Changes').click();
    await expect(stylus.ui('.changes .badge')).toHaveCount(2);

    // One undo removes the whole AI change.
    await page.mouse.click(5, 300);
    await page.keyboard.press('Meta+z');
    expect(await stylus.style('#second', 'background-color')).not.toBe('rgb(17, 17, 17)');
    expect(await stylus.style('aside', 'display')).not.toBe('none');
  });

  test('Reject restores the page and keeps the prompt for editing', async ({ stylus, claude, page }) => {
    claude.reply('Sepia.', [{ kind: 'preset', preset: 'sepia' }]);
    await page.keyboard.press('Meta+k');
    await stylus.ui('.ai-input').fill('warm it up');
    await stylus.ui('.ai-input').press('Enter');
    await expect(stylus.ui('.ai-preview')).toBeVisible();
    expect(await stylus.style('html', 'filter')).toContain('sepia');
    await stylus.ui('.ai-input').press('Escape');
    await expect(stylus.ui('.ai-preview')).toHaveCount(0);
    expect(await stylus.style('html', 'filter')).toBe('none');
    await expect(stylus.ui('.ai-input')).toHaveValue('warm it up');
    await stylus.ui('.ai-input').press('Escape');
    await expect(bar(stylus)).toHaveCount(0);
  });

  test('a follow-up refines the previous proposal with the conversation so far', async ({ stylus, claude, page }) => {
    await stylus.pick('#title');
    claude.reply('Made the title blue.', [{ selector: '#title', declarations: [{ property: 'color', value: 'rgb(0, 0, 255)' }] }]);
    claude.reply('Made it darker blue.', [{ selector: '#title', declarations: [{ property: 'color', value: 'rgb(0, 0, 120)' }] }]);
    await page.keyboard.press('Meta+k');
    await stylus.ui('.ai-input').fill('make the title blue');
    await stylus.ui('.ai-input').press('Enter');
    await expect(stylus.ui('.ai-summary')).toHaveText('Made the title blue.');
    await stylus.ui('.ai-input').fill('darker');
    await stylus.ui('.ai-input').press('Enter');
    await expect(stylus.ui('.ai-summary')).toHaveText('Made it darker blue.');
    expect(await stylus.style('#title', 'color')).toBe('rgb(0, 0, 120)');

    const second = claude.requests[1].body.messages;
    expect(second.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(second[1].content).toContain('Made the title blue.');
    expect(second[2].content).toContain('darker');
  });

  test('suggestions run on the whole page when nothing is selected', async ({ stylus, claude, page }) => {
    claude.reply('Calmer.', [{ kind: 'preset', preset: 'dim' }]);
    await page.keyboard.press('Meta+k');
    await expect(stylus.ui('.ai-chip')).toHaveText('Whole page');
    await stylus.ui('.ai-suggestions button').first().click();
    await expect(stylus.ui('.ai-preview')).toBeVisible();
    const content = claude.requests[0].body.messages[0].content;
    expect(content).toContain('<selection>none');
    expect(content).toContain('<request>\nMake this calmer\n</request>');
  });

  test('drops edits with invalid selectors and says so when nothing is left', async ({ stylus, claude, page }) => {
    claude.reply('Tried.', [{ kind: 'hide', selector: '!!not a selector' }]);
    await page.keyboard.press('Meta+k');
    await stylus.ui('.ai-input').fill('hide the thing');
    await stylus.ui('.ai-input').press('Enter');
    await expect(stylus.ui('.ai-error')).toContainText('Tried.');
    await expect(stylus.ui('.ai-preview')).toHaveCount(0);
  });

  test('a rejected API key offers to change it', async ({ stylus, claude, page }) => {
    claude.error(401, 'authentication_error', 'invalid x-api-key');
    await page.keyboard.press('Meta+k');
    await stylus.ui('.ai-input').fill('anything');
    await stylus.ui('.ai-input').press('Enter');
    await expect(stylus.ui('.ai-error')).toContainText('That API key was rejected');
    await stylus.ui('.ai-error .link').click();
    await expect(bar(stylus)).toContainText('Connect Claude');
  });

  test('a refusal shows a message instead of edits', async ({ stylus, claude, page }) => {
    claude.reply('', [], { stop_reason: 'refusal', content: [] });
    await page.keyboard.press('Meta+k');
    await stylus.ui('.ai-input').fill('anything');
    await stylus.ui('.ai-input').press('Enter');
    await expect(stylus.ui('.ai-error')).toContainText('declined');
  });

  test('leaving edit mode discards an unaccepted preview', async ({ stylus, claude, page }) => {
    claude.reply('Sepia.', [{ kind: 'preset', preset: 'sepia' }]);
    await page.keyboard.press('Meta+k');
    await stylus.ui('.ai-input').fill('warm');
    await stylus.ui('.ai-input').press('Enter');
    await expect(stylus.ui('.ai-preview')).toBeVisible();
    await stylus.exit();
    expect(await stylus.style('html', 'filter')).toBe('none');
  });

  test('the toolbar button and Cmd+K toggle the bar', async ({ stylus, page }) => {
    await stylus.toolbarButton('Edit with AI').click();
    await expect(bar(stylus)).toBeVisible();
    await stylus.toolbarButton('Edit with AI').click();
    await expect(bar(stylus)).toHaveCount(0);
    await page.keyboard.press('Meta+k');
    await expect(bar(stylus)).toBeVisible();
  });
});
