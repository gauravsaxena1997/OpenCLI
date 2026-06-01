import { cli, Strategy } from '@jackwener/opencli/registry';
import { ArgumentError, AuthRequiredError, CommandExecutionError } from '@jackwener/opencli/errors';
import {
  NAUKRI_RECOMMENDED_JOBS_URL,
  looksLikeNaukriAuthWall,
  normalizeWhitespace,
} from './shared.js';

export const HIDE_RECOMMENDED_JOB_COLUMNS = [
  'status',
  'job_id',
  'title',
  'company',
  'tab',
  'action',
];

const TAB_ALIASES = {
  all: 'all',
  profile: 'profile',
  'top-candidate': 'top-candidate',
  topcandidate: 'top-candidate',
  'top-candidates': 'top-candidate',
  preferences: 'preferences',
  preference: 'preferences',
  'you-might-like': 'you-might-like',
  mightlike: 'you-might-like',
  similar: 'you-might-like',
};

function tabKey(value) {
  const key = normalizeWhitespace(value)
    .toLowerCase()
    .replace(/\(\d+\)/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return TAB_ALIASES[key] || key;
}

function splitTabs(value) {
  const tabs = String(value ?? 'all')
    .split(',')
    .map(tabKey)
    .filter(Boolean);
  return tabs.length ? [...new Set(tabs)] : ['all'];
}

function requireJobId(value) {
  const jobId = normalizeWhitespace(value);
  if (!jobId) throw new ArgumentError('--job-id is required');
  if (!/^\d{6,}$/.test(jobId)) throw new ArgumentError('--job-id must be a Naukri numeric job id');
  return jobId;
}

function readSettleSeconds(value) {
  const fallback = 5;
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 15) {
    throw new ArgumentError('--settle-seconds must be an integer between 1 and 15');
  }
  return parsed;
}

function parseHideRecommendedJobResult(payload, expectedJobId, execute) {
  if (!payload || typeof payload !== 'object') {
    throw new CommandExecutionError('Naukri hide-recommended-job returned malformed payload');
  }
  if (looksLikeNaukriAuthWall(payload)) {
    throw new AuthRequiredError('naukri.com', 'Open https://www.naukri.com in the connected browser and sign in, then retry.');
  }
  if (!payload.ok) {
    throw new CommandExecutionError(
      `Could not hide Naukri recommended job: ${payload.error || 'hide_recommended_job_failed'}`,
      JSON.stringify(payload, null, 2),
    );
  }
  const jobId = normalizeWhitespace(payload.job_id);
  if (jobId !== expectedJobId) {
    throw new CommandExecutionError(`Naukri hide-recommended-job matched unexpected job id: ${jobId || '(empty)'}`);
  }
  return [{
    status: execute ? 'hidden' : 'dry-run',
    job_id: jobId,
    title: normalizeWhitespace(payload.title),
    company: normalizeWhitespace(payload.company),
    tab: normalizeWhitespace(payload.tab),
    action: execute ? 'hide' : 'would-hide',
  }];
}

function buildHideRecommendedJobScript({ jobId, title, company, tabs, execute }) {
  return `
    (async () => {
      const expectedJobId = ${JSON.stringify(jobId)};
      const expectedTitle = ${JSON.stringify(normalizeWhitespace(title).toLowerCase())};
      const expectedCompany = ${JSON.stringify(normalizeWhitespace(company).toLowerCase())};
      const requestedTabs = ${JSON.stringify(tabs)};
      const execute = ${execute ? 'true' : 'false'};
      const clean = (value) => String(value || '').replace(/[\\u00a0\\u202f]+/g, ' ').replace(/\\s+/g, ' ').trim();
      const visible = (el) => {
        const rect = el && el.getBoundingClientRect ? el.getBoundingClientRect() : null;
        return !!rect && rect.width > 0 && rect.height > 0;
      };
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const tabKey = (value) => clean(value).toLowerCase().replace(/\\(\\d+\\)/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const alias = (key) => ({
        all: 'all',
        profile: 'profile',
        topcandidate: 'top-candidate',
        'top-candidate': 'top-candidate',
        'top-candidates': 'top-candidate',
        preference: 'preferences',
        preferences: 'preferences',
        mightlike: 'you-might-like',
        'you-might-like': 'you-might-like',
        similar: 'you-might-like',
      }[key] || key);
      const requested = requestedTabs.map((label) => alias(tabKey(label))).filter(Boolean);
      const includeTab = (label) => requested.length === 0 || requested.includes('all') || requested.includes(alias(tabKey(label)));
      const cardJobId = (card) => clean(card.getAttribute('data-job-id') || card.getAttribute('data-jobid') || card.dataset?.jobId || '');
      const closestCard = (el) => {
        let node = el;
        for (let depth = 0; depth < 8 && node && node !== document.body; depth++) {
          const text = clean(node.innerText || node.textContent);
          if (text.length > 80 && text.length < 2800 && /yrs?|lacs?|not disclosed|remote|hybrid|save|hide|posted by|days? ago|few hours ago/i.test(text)) return node;
          node = node.parentElement;
        }
        return el;
      };
      const candidateCards = () => {
        const controls = Array.from(document.querySelectorAll('.tuple-check-box, [class*="jobTuple"], [class*="job-tuple"], [class*="jobCard"], [class*="job-card"], [data-job-id], [data-jobid], article'));
        return controls.map(closestCard)
          .filter((card, index, all) => card && visible(card) && all.indexOf(card) === index)
          .filter((card) => {
            const text = clean(card.innerText || card.textContent);
            return text.length > 80 && text.length < 5000 && /save|hide|yrs?|lacs?|not disclosed|remote|hybrid|days? ago|few hours ago/i.test(text);
          });
      };
      const readCard = (card, tab) => {
        const rawText = clean(card.innerText || card.textContent);
        const lines = rawText.split(/\\n+/).map(clean).filter(Boolean);
        const titleText = clean(card.querySelector('a[href*="job-listings"], h1,h2,h3,[class*="title"],[class*="Title"]')?.innerText || lines[0] || '');
        const companyText = clean(card.querySelector('[class*="company"],[class*="Company"],[class*="comp"]')?.innerText || lines[1] || '');
        return {
          job_id: cardJobId(card),
          title: titleText,
          company: companyText,
          tab: clean(tab).replace(/\\s*\\(\\d+\\)$/, ''),
          raw_text: rawText,
        };
      };
      const findHideButton = (card) => Array.from(card.querySelectorAll('button,a,[role="button"],span,div'))
        .filter(visible)
        .map((el) => {
          const label = clean(el.innerText || el.textContent || el.getAttribute('aria-label'));
          if (!/^hide$/i.test(label)) return null;
          return el.closest('button,a,[role="button"],[onclick],[class*="hide"],[class*="Hide"],[class*="action"],[class*="Action"]') || el;
        })
        .find(Boolean);
      const findMatchedCard = () => {
        for (const card of candidateCards()) {
          const row = readCard(card, '');
          if (row.job_id === expectedJobId && matchesGuards(row)) return card;
        }
        return null;
      };
      const matchesGuards = (row) => {
        const haystack = clean([row.title, row.company, row.raw_text].join(' ')).toLowerCase();
        if (expectedTitle && !haystack.includes(expectedTitle)) return false;
        if (expectedCompany && !haystack.includes(expectedCompany)) return false;
        return true;
      };
      const tabElements = Array.from(document.querySelectorAll('.tab-wrapper, [role="tab"], button, a, li, div, span'))
        .filter(visible)
        .map((el) => ({ el, clickTarget: el.querySelector?.('.tab-list-item') || el, label: clean(el.innerText || el.textContent || el.getAttribute('aria-label') || el.getAttribute('title')) }))
        .filter((item) => /^(Profile|Top Candidate|Preferences|You might like)\\s*(?:\\(\\d+\\))?$/i.test(item.label))
        .filter((item, index, all) => all.findIndex((other) => alias(tabKey(other.label)) === alias(tabKey(item.label))) === index);
      const targetTabs = tabElements.filter((item) => includeTab(item.label));
      const sources = targetTabs.length ? targetTabs : [{ el: null, label: 'Recommended Jobs' }];

      for (const source of sources) {
        if (source.el) {
          try {
            const target = source.clickTarget || source.el;
            target.scrollIntoView({ block: 'center', inline: 'center' });
            if (typeof target.click === 'function') target.click();
            else source.el.click();
            await wait(1200);
          } catch (_) {}
        }
        for (const card of candidateCards()) {
          const row = readCard(card, source.label);
          if (row.job_id !== expectedJobId) continue;
          if (!matchesGuards(row)) {
            return { ok: false, error: 'guard_mismatch', ...row, url: location.href, title_text: document.title || '', text: document.body?.innerText?.slice(0, 5000) || '' };
          }
          const hideButton = findHideButton(card);
          if (!hideButton) return { ok: false, error: 'hide_button_not_found', ...row, url: location.href, title_text: document.title || '', text: document.body?.innerText?.slice(0, 5000) || '' };
          if (execute) {
            hideButton.setAttribute('data-opencli-hide-recommended-job-target', expectedJobId);
            hideButton.scrollIntoView({ block: 'center', inline: 'center' });
          }
          return { ok: true, ...row, selector: '[data-opencli-hide-recommended-job-target="' + expectedJobId + '"]', url: location.href, title_text: document.title || '', text: document.body?.innerText?.slice(0, 5000) || '' };
        }
      }
      return { ok: false, error: 'job_not_found', job_id: expectedJobId, url: location.href, title_text: document.title || '', text: document.body?.innerText?.slice(0, 5000) || '' };
    })()
  `;
}

function buildVisibleTextAfterTabsScript(tabs) {
  return `
    (async () => {
      const requestedTabs = ${JSON.stringify(tabs)};
      const clean = (value) => String(value || '').replace(/[\\u00a0\\u202f]+/g, ' ').replace(/\\s+/g, ' ').trim();
      const visible = (el) => {
        const rect = el && el.getBoundingClientRect ? el.getBoundingClientRect() : null;
        return !!rect && rect.width > 0 && rect.height > 0;
      };
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const tabKey = (value) => clean(value).toLowerCase().replace(/\\(\\d+\\)/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const alias = (key) => ({
        all: 'all',
        profile: 'profile',
        topcandidate: 'top-candidate',
        'top-candidate': 'top-candidate',
        'top-candidates': 'top-candidate',
        preference: 'preferences',
        preferences: 'preferences',
        mightlike: 'you-might-like',
        'you-might-like': 'you-might-like',
        similar: 'you-might-like',
      }[key] || key);
      const requested = requestedTabs.map((label) => alias(tabKey(label))).filter(Boolean);
      const includeTab = (label) => requested.length === 0 || requested.includes('all') || requested.includes(alias(tabKey(label)));
      const tabElements = Array.from(document.querySelectorAll('.tab-wrapper, [role="tab"], button, a, li, div, span'))
        .filter(visible)
        .map((el) => ({ el, clickTarget: el.querySelector?.('.tab-list-item') || el, label: clean(el.innerText || el.textContent || el.getAttribute('aria-label') || el.getAttribute('title')) }))
        .filter((item) => /^(Profile|Top Candidate|Preferences|You might like)\\s*(?:\\(\\d+\\))?$/i.test(item.label))
        .filter((item, index, all) => all.findIndex((other) => alias(tabKey(other.label)) === alias(tabKey(item.label))) === index);
      const targetTabs = tabElements.filter((item) => includeTab(item.label));
      const texts = [];
      for (const source of targetTabs.length ? targetTabs : [{ el: null, label: 'Recommended Jobs' }]) {
        if (source.el) {
          const target = source.clickTarget || source.el;
          target.scrollIntoView({ block: 'center', inline: 'center' });
          target.click();
          await wait(1200);
        }
        texts.push(clean(document.body?.innerText || ''));
      }
      return { ok: true, url: location.href, title: document.title || '', text: texts.join(' ') };
    })()
  `;
}

cli({
  site: 'naukri',
  name: 'hide-recommended-job',
  access: 'write',
  description: 'Hide one visible Naukri recommended job by job id, with optional title/company guards',
  domain: 'www.naukri.com',
  strategy: Strategy.COOKIE,
  browser: true,
  navigateBefore: false,
  args: [
    { name: 'job-id', type: 'str', required: true, help: 'Naukri job id from recommended-jobs output' },
    { name: 'title', type: 'str', help: 'Optional title guard; command fails if the matched card does not contain it' },
    { name: 'company', type: 'str', help: 'Optional company guard; command fails if the matched card does not contain it' },
    { name: 'tabs', type: 'string', default: 'all', help: 'Comma-separated tabs to search before hiding: all, profile, top-candidate, preferences, you-might-like' },
    { name: 'settle-seconds', type: 'int', default: 5, help: 'Seconds to wait after clicking Hide before verifying, 1-15' },
    { name: 'execute', type: 'boolean', default: false, help: 'Actually click Hide. Without it the command only verifies the target.' },
  ],
  columns: HIDE_RECOMMENDED_JOB_COLUMNS,
  func: async (page, args) => {
    if (!page) throw new CommandExecutionError('Browser session required for naukri hide-recommended-job');
    const jobId = requireJobId(args['job-id']);
    const title = normalizeWhitespace(args.title);
    const company = normalizeWhitespace(args.company);
    const execute = !!args.execute;
    if (execute && !title && !company) {
      throw new ArgumentError('Refusing to hide without a guard: pass --title or --company with --execute');
    }
    const settleSeconds = readSettleSeconds(args['settle-seconds']);
    const tabs = splitTabs(args.tabs || 'all');
    await page.goto(NAUKRI_RECOMMENDED_JOBS_URL);
    await page.wait(5);
    const payload = await page.evaluate(buildHideRecommendedJobScript({ jobId, title, company, tabs, execute }));
    if (execute) {
      if (!payload?.ok || !payload?.selector) {
        return parseHideRecommendedJobResult(payload, jobId, execute);
      }
      await page.click(payload.selector);
      await page.wait(settleSeconds);
      await page.goto(NAUKRI_RECOMMENDED_JOBS_URL);
      await page.wait(3);
      const verifyPayload = await page.evaluate(buildVisibleTextAfterTabsScript(tabs));
      const visibleText = normalizeWhitespace(verifyPayload?.text).toLowerCase();
      const titleStillVisible = title && visibleText.includes(title.toLowerCase());
      const companyStillVisible = company && visibleText.includes(company.toLowerCase());
      const guardedCardStillVisible = title && company
        ? titleStillVisible && companyStillVisible
        : titleStillVisible || companyStillVisible;
      if (guardedCardStillVisible) {
        throw new CommandExecutionError(
          'Could not hide Naukri recommended job: hide_not_confirmed',
          JSON.stringify({ ...verifyPayload, job_id: jobId, expected_title: title, expected_company: company }, null, 2),
        );
      }
    }
    return parseHideRecommendedJobResult(payload, jobId, execute);
  },
});

export const __test__ = {
  buildHideRecommendedJobScript,
  buildVisibleTextAfterTabsScript,
  parseHideRecommendedJobResult,
  requireJobId,
  readSettleSeconds,
  splitTabs,
};
