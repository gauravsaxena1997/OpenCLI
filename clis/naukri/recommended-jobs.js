import { cli, Strategy } from '@jackwener/opencli/registry';
import { ArgumentError, AuthRequiredError, CommandExecutionError } from '@jackwener/opencli/errors';
import {
  NAUKRI_RECOMMENDED_JOBS_URL,
  looksLikeNaukriAuthWall,
  normalizeWhitespace,
} from './shared.js';

export const RECOMMENDED_JOB_COLUMNS = [
  'tab',
  'rank',
  'title',
  'company',
  'location',
  'experience',
  'salary',
  'posted',
  'description',
  'skills',
  'recruiter_or_posted_by',
  'company_rating',
  'reviews_count',
  'work_mode',
  'notice_period_signal',
  'apply_state',
  'is_selected',
  'can_select',
  'job_url',
  'job_id',
  'source_url',
  'raw_text',
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

function clampInt(value, label, fallback, min, max) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new ArgumentError(`${label} must be an integer between ${min} and ${max}`);
  }
  return parsed;
}

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

function normalizeUrl(value) {
  const raw = normalizeWhitespace(value);
  if (!raw) return '';
  try {
    return new URL(raw, 'https://www.naukri.com').toString().replace(/[?#].*$/, '');
  } catch {
    return raw;
  }
}

function extractJobId(value) {
  const text = normalizeWhitespace(value);
  if (!text) return '';
  const urlMatch = text.match(/(?:job-listings|jobdetail|jobId=|jobid=|jid=)[^0-9]*(\d{6,})/i);
  if (urlMatch) return urlMatch[1];
  const trailingMatch = text.match(/-(\d{8,})$/);
  return trailingMatch ? trailingMatch[1] : '';
}

function parseLines(text) {
  return String(text ?? '')
    .split(/\n+/)
    .map(normalizeWhitespace)
    .filter(Boolean);
}

function firstMatching(lines, pattern) {
  return lines.find((line) => pattern.test(line)) || '';
}

function stripNoise(value) {
  return normalizeWhitespace(value)
    .replace(/\bSave\b\s*\bHide\b$/i, '')
    .trim();
}

function splitCompanyAndRecruiter(value) {
  const text = normalizeWhitespace(value);
  const match = text.match(/^(.*?)\s+(posted by\s+.+)$/i);
  if (!match) return { company: text, recruiter: '' };
  return {
    company: normalizeWhitespace(match[1]),
    recruiter: normalizeWhitespace(match[2]),
  };
}

function splitCompanyRatingReviews(value) {
  const text = normalizeWhitespace(value);
  const match = text.match(/^(.*?)\s+(\d+(?:\.\d+)?)\s+(\d[\d,]*\s+reviews?)$/i);
  if (!match) return { company: text, rating: '', reviews: '' };
  return {
    company: normalizeWhitespace(match[1]),
    rating: normalizeWhitespace(match[2]),
    reviews: normalizeWhitespace(match[3]),
  };
}

function inferTitle(lines, explicitTitle) {
  const title = normalizeWhitespace(explicitTitle);
  if (title) return title;
  return lines.find((line) => {
    if (line.length < 3 || line.length > 150) return false;
    if (/^(apply|save|hide|view|posted|not interested|recommended jobs)$/i.test(line)) return false;
    return /engineer|developer|architect|manager|lead|analyst|consultant|designer|specialist|intern|qa|sdet|full stack|frontend|backend|software|react|node|java|python|mern|next/i.test(line);
  }) || '';
}

function inferCompany(lines, explicitCompany, title) {
  const splitRecruiter = splitCompanyAndRecruiter(explicitCompany);
  const splitRating = splitCompanyRatingReviews(splitRecruiter.company);
  if (splitRating.company) return splitRating.company;
  const titleIndex = lines.findIndex((line) => line === title);
  const candidates = lines.slice(titleIndex >= 0 ? titleIndex + 1 : 1);
  return candidates.find((line) => {
    if (line.length < 2 || line.length > 140) return false;
    if (/^(apply|save|hide|view|posted|not interested)$/i.test(line)) return false;
    if (/^posted by\b/i.test(line)) return false;
    if (/reviews?|years?|yrs?|₹|\brs\.?\b|\blakh\b|remote|hybrid|full time|part time|contract|days? ago|weeks? ago/i.test(line)) return false;
    return true;
  }) || '';
}

function inferRecruiter(lines, rawText, explicitRecruiter, explicitCompany) {
  const recruiter = normalizeWhitespace(explicitRecruiter);
  if (recruiter) return recruiter;
  const split = splitCompanyAndRecruiter(explicitCompany);
  if (split.recruiter) return split.recruiter;
  const line = firstMatching(lines, /^posted by\b/i);
  if (line) return line;
  const match = normalizeWhitespace(rawText).match(/\bposted by\s+([A-Za-z0-9][A-Za-z0-9 .,&'()-]{1,80})/i);
  return match ? `Posted by ${normalizeWhitespace(match[1])}` : '';
}

function inferDescription(lines, rawDescription) {
  const description = normalizeWhitespace(rawDescription);
  if (description) return description;
  const candidate = lines.find((line) => {
    if (line.length < 35) return false;
    if (/^(posted by|save|hide|apply)$/i.test(line)) return false;
    if (/^(?:\d+(?:\.\d+)?\s+)?\d+\s+reviews?$/i.test(line)) return false;
    if (/^\d+\s*-\s*\d+\s*yrs?/i.test(line)) return false;
    return true;
  });
  return stripNoise(candidate || '');
}

function inferWorkMode(value) {
  const text = normalizeWhitespace(value);
  const match = text.match(/\b(remote|hybrid|on-site|onsite)\b/i);
  return match ? match[1].replace(/^onsite$/i, 'On-site') : '';
}

function inferNoticePeriod(lines, description) {
  const text = normalizeWhitespace([description, ...lines].join(' '));
  const match = text.match(/(?:notice period|joining|joiner|immediate|serving notice|available to join)[^.;,]{0,90}/i);
  return match ? normalizeWhitespace(match[0]) : '';
}

function normalizeBoolean(value) {
  return value === true ? 'true' : value === false ? 'false' : normalizeWhitespace(value);
}

function normalizeRecommendedJob(raw, index) {
  const lines = parseLines(raw?.raw_text || raw?.text);
  const title = inferTitle(lines, raw?.title);
  const company = inferCompany(lines, raw?.company, title);
  const companyMeta = splitCompanyRatingReviews(splitCompanyAndRecruiter(raw?.company).company);
  const location = normalizeWhitespace(raw?.location) || firstMatching(lines, /remote|hybrid|onsite|on-site|india|bangalore|bengaluru|delhi|mumbai|hyderabad|pune|jaipur|gurugram|gurgaon|noida|chennai/i);
  const description = inferDescription(lines, raw?.description);
  const jobUrl = normalizeUrl(raw?.job_url || raw?.url);
  const row = {
    tab: normalizeWhitespace(raw?.tab) || 'Recommended Jobs',
    rank: String(index + 1),
    title,
    company,
    location,
    experience: normalizeWhitespace(raw?.experience) || firstMatching(lines, /\b\d+\s*-\s*\d+\s*(?:yrs?|years?)\b|\b\d+\s*(?:yrs?|years?)\b/i),
    salary: normalizeWhitespace(raw?.salary) || firstMatching(lines, /₹|\brs\.?\b|\binr\b|\blakh\b|\blac\b|\bcrore\b|not disclosed/i),
    posted: normalizeWhitespace(raw?.posted) || firstMatching(lines, /posted|today|few hours ago|just now|\d+\s+(?:day|days|hour|hours|week|weeks|month|months)\s+ago/i),
    description,
    skills: Array.isArray(raw?.skills) ? raw.skills.map(normalizeWhitespace).filter(Boolean).join(', ') : normalizeWhitespace(raw?.skills || raw?.tags),
    recruiter_or_posted_by: inferRecruiter(lines, raw?.raw_text || raw?.text, raw?.recruiter_or_posted_by, raw?.company),
    company_rating: normalizeWhitespace(raw?.company_rating) || companyMeta.rating || firstMatching(lines, /^\d+(?:\.\d+)?$/),
    reviews_count: normalizeWhitespace(raw?.reviews_count) || companyMeta.reviews || firstMatching(lines, /^\d[\d,]*\s+reviews?$/i),
    work_mode: normalizeWhitespace(raw?.work_mode) || inferWorkMode(location),
    notice_period_signal: normalizeWhitespace(raw?.notice_period_signal) || inferNoticePeriod(lines, description),
    apply_state: normalizeWhitespace(raw?.apply_state) || firstMatching(lines, /applied|apply|saved|save|hide|not interested|viewed/i),
    is_selected: normalizeBoolean(raw?.is_selected),
    can_select: normalizeBoolean(raw?.can_select),
    job_url: jobUrl,
    job_id: normalizeWhitespace(raw?.job_id) || extractJobId(jobUrl || raw?.raw_text),
    source_url: normalizeUrl(raw?.source_url),
    raw_text: normalizeWhitespace(lines.join(' ')).slice(0, 2000),
  };
  return Object.fromEntries(RECOMMENDED_JOB_COLUMNS.map((column) => [column, normalizeWhitespace(row[column])]));
}

function looksLikeRecommendedJobsPageWrapper(row) {
  const text = normalizeWhitespace(row?.raw_text);
  if (!text) return false;
  if (row?.job_id || row?.job_url) return false;
  return /^recommended jobs for you\b/i.test(text)
    && /\bprofile\s*\(\d+\)/i.test(text)
    && /\btop candidate\s*\(\d+\)/i.test(text)
    && /\bpreferences\s*\(\d+\)/i.test(text);
}

export function parseRecommendedJobsPayload(payload, limitPerTab = 25) {
  if (!payload || typeof payload !== 'object') {
    throw new CommandExecutionError('Naukri recommended-jobs returned malformed extraction payload');
  }
  if (looksLikeNaukriAuthWall(payload)) {
    throw new AuthRequiredError('naukri.com', 'Open https://www.naukri.com in the connected browser and sign in, then retry.');
  }
  const items = Array.isArray(payload.items) ? payload.items : [];
  const counts = new Map();
  const rows = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const tab = normalizeWhitespace(item.tab) || 'Recommended Jobs';
    const current = counts.get(tab) || 0;
    if (current >= limitPerTab) continue;
    const row = normalizeRecommendedJob(item, current);
    if (looksLikeRecommendedJobsPageWrapper(row)) continue;
    if (!row.title && !row.company && !row.job_url) continue;
    counts.set(tab, current + 1);
    rows.push(row);
  }
  if (!rows.length) {
    throw new CommandExecutionError('Naukri recommended-jobs could not find job cards; the page structure may have changed or the selected tabs are empty.');
  }
  return rows;
}

function buildRecommendedJobsExtractionScript(tabs, limitPerTab) {
  return `
    (async () => {
      const requestedTabs = ${JSON.stringify(tabs)};
      const limitPerTab = ${Number(limitPerTab) || 25};
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
      const isJobHref = (href) => /naukri\\.com\\/.+job|job-listings|\\/jobs?\\//i.test(String(href || ''));
      const tabElements = Array.from(document.querySelectorAll('.tab-wrapper, [role="tab"], button, a, li, div, span'))
        .filter(visible)
        .map((el) => ({ el, clickTarget: el.querySelector?.('.tab-list-item') || el, label: clean(el.innerText || el.textContent || el.getAttribute('aria-label') || el.getAttribute('title')) }))
        .filter((item) => /^(Profile|Top Candidate|Preferences|You might like)\\s*(?:\\(\\d+\\))?$/i.test(item.label))
        .filter((item, index, all) => all.findIndex((other) => alias(tabKey(other.label)) === alias(tabKey(item.label))) === index);
      const targetTabs = tabElements.filter((item) => includeTab(item.label));
      const sources = targetTabs.length ? targetTabs : [{ el: null, label: 'Recommended Jobs' }];
      const items = [];

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
        const byControl = controls.map(closestCard);
        const byTitle = Array.from(document.querySelectorAll('a[href], h1, h2, h3')).filter(visible)
          .filter((el) => isJobHref(el.href) || /engineer|developer|architect|manager|lead|analyst|consultant|designer|specialist|intern|software|react|node|java|python|mern|next/i.test(clean(el.innerText || el.textContent)))
          .map(closestCard);
        return [...byControl, ...byTitle]
          .filter((card, index, all) => card && visible(card) && all.indexOf(card) === index)
          .filter((card) => {
            const text = clean(card.innerText || card.textContent);
            return text.length > 80 && text.length < 5000 && /save|hide|yrs?|lacs?|not disclosed|remote|hybrid|days? ago|few hours ago/i.test(text);
          });
      };
      const readCard = (card, tab) => {
        const rawText = clean(card.innerText || card.textContent);
        const lines = rawText.split(/\\n+/).map(clean).filter(Boolean);
        const anchors = Array.from(card.querySelectorAll('a[href]'));
        const jobAnchor = anchors.find((a) => isJobHref(a.href));
        const titleAnchor = jobAnchor || anchors.find((a) => clean(a.innerText || a.textContent).length > 3);
        const title = clean(card.querySelector('a[href*="job-listings"], h1,h2,h3,[class*="title"],[class*="Title"]')?.innerText || titleAnchor?.innerText || lines[0] || '');
        const company = clean(card.querySelector('[class*="company"],[class*="Company"],[class*="comp"]')?.innerText || lines[1] || '');
        const postedBy = lines.find((line) => /^posted by\\b/i.test(line)) || '';
        const rating = lines.find((line) => /^\\d+(?:\\.\\d+)?$/.test(line)) || '';
        const reviews = lines.find((line) => /^\\d[\\d,]*\\s+reviews?$/i.test(line)) || '';
        const metaLine = lines.find((line) => /yrs?|lacs?|not disclosed|remote|hybrid|on-site|onsite/i.test(line)) || '';
        const experience = clean(card.querySelector('[class*="experience"],[class*="Experience"],[class*="exp"]')?.innerText || (metaLine.match(/\\b\\d+\\s*-\\s*\\d+\\s*(?:yrs?|years?)\\b|\\b\\d+\\s*(?:yrs?|years?)\\b/i)?.[0] || ''));
        const salary = clean(card.querySelector('[class*="salary"],[class*="Salary"],[class*="sal"]')?.innerText || (metaLine.match(/(?:₹\\s*)?\\d+(?:\\.\\d+)?\\s*-\\s*\\d+(?:\\.\\d+)?\\s*Lacs?\\s*PA|not disclosed|₹[^\\n]+/i)?.[0] || ''));
        const locationText = clean(card.querySelector('[class*="location"],[class*="Location"],[class*="loc"]')?.innerText || (metaLine.match(/(?:Remote|Hybrid|On-site|Onsite)(?:\\s*-\\s*[^\\n]+)?|(?:Bengaluru|Bangalore|Delhi|Mumbai|Hyderabad|Pune|Jaipur|Gurugram|Gurgaon|Noida|Chennai)[^\\n]*/i)?.[0] || ''));
        const posted = clean(card.querySelector('[class*="posted"],[class*="Posted"],[class*="date"],[class*="Date"]')?.innerText || (rawText.match(/today|few hours ago|just now|\\d+\\s+(?:day|days|hour|hours|week|weeks|month|months)\\s+ago/i)?.[0] || ''));
        const skillTexts = Array.from(card.querySelectorAll('[class*="skill"],[class*="tag"],[class*="chip"],[class*="label"]'))
          .map((el) => clean(el.innerText || el.textContent))
          .filter((text) => text && text.length <= 80 && !/save|hide|review|posted/i.test(text));
        const description = lines.find((line) => line.length > 35 && ![title, company, postedBy, rating, reviews, metaLine].includes(line) && !/^(save|hide)$/i.test(line)) || '';
        const selectable = card.querySelector('.tuple-check-box, [class*="checkbox"], [class*="check-box"], input[type="checkbox"], [role="checkbox"]');
        const selected = selectable ? /checked|selected/i.test(String(selectable.className || '') + ' ' + (selectable.getAttribute('aria-checked') || '')) || selectable.checked === true : false;
        const applyState = Array.from(card.querySelectorAll('button,a,[role="button"],span,div'))
          .map((el) => clean(el.innerText || el.textContent || el.getAttribute('aria-label')))
          .find((text) => /^(apply|applied|save|saved|hide|not interested|viewed)$/i.test(text)) || '';
        return {
          tab: clean(tab).replace(/\\s*\\(\\d+\\)$/, ''),
          title,
          company,
          location: locationText,
          experience,
          salary,
          posted,
          description,
          skills: skillTexts,
          recruiter_or_posted_by: postedBy,
          company_rating: rating,
          reviews_count: reviews,
          work_mode: (locationText.match(/\\b(remote|hybrid|on-site|onsite)\\b/i)?.[1] || ''),
          notice_period_signal: (rawText.match(/(?:notice period|joining|joiner|immediate|serving notice|available to join)[^.;,]{0,90}/i)?.[0] || ''),
          apply_state: applyState,
          is_selected: selected,
          can_select: !!selectable,
          job_url: jobAnchor?.href || '',
          job_id: card.getAttribute('data-job-id') || card.getAttribute('data-jobid') || '',
          source_url: window.location.href,
          raw_text: rawText,
        };
      };

      for (const source of sources) {
        if (source.el) {
          try {
            const target = source.clickTarget || source.el;
            target.scrollIntoView({ block: 'center', inline: 'center' });
            if (typeof target.click === 'function') target.click();
            else source.el.click();
            await wait(1600);
          } catch (_) {}
        }
        if (typeof window.scrollTo === 'function') window.scrollTo(0, 0);
        await wait(500);
        const seen = new Set();
        let count = 0;
        for (const card of candidateCards()) {
          const row = readCard(card, source.label);
          const key = [row.job_url, row.title, row.company, row.raw_text.slice(0, 160)].join('|').toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          if (!row.can_select && !row.job_id) continue;
          items.push(row);
          count += 1;
          if (count >= limitPerTab) break;
        }
      }
      return {
        url: location.href,
        title: document.title || '',
        text: document.body ? (document.body.innerText || '').slice(0, 5000) : '',
        tabs: tabElements.map((item) => item.label),
        items,
      };
    })()
  `;
}

cli({
  site: 'naukri',
  name: 'recommended-jobs',
  access: 'read',
  description: 'Read visible Naukri recommended job cards across profile, top-candidate, preferences, and you-might-like tabs',
  domain: 'www.naukri.com',
  strategy: Strategy.COOKIE,
  browser: true,
  navigateBefore: false,
  args: [
    { name: 'tabs', type: 'string', default: 'all', help: 'Comma-separated tabs: all, profile, top-candidate, preferences, you-might-like' },
    { name: 'limit-per-tab', type: 'int', default: 25, help: 'Max job cards per selected tab, 1-100' },
  ],
  columns: RECOMMENDED_JOB_COLUMNS,
  func: async (page, args) => {
    if (!page) throw new CommandExecutionError('Browser session required for naukri recommended-jobs');
    const limitPerTab = clampInt(args['limit-per-tab'], 'limit-per-tab', 25, 1, 100);
    const tabs = splitTabs(args.tabs || 'all');
    await page.goto(NAUKRI_RECOMMENDED_JOBS_URL);
    await page.wait(5);
    if (typeof page.autoScroll === 'function') {
      await page.autoScroll({ times: 2, delayMs: 500 });
      await page.wait(1);
    }
    const payload = await page.evaluate(buildRecommendedJobsExtractionScript(tabs, limitPerTab));
    return parseRecommendedJobsPayload(payload, limitPerTab);
  },
});

export const __test__ = {
  buildRecommendedJobsExtractionScript,
  extractJobId,
  normalizeRecommendedJob,
  parseRecommendedJobsPayload,
  splitTabs,
};
