import { cli, Strategy } from '@jackwener/opencli/registry';
import { ArgumentError, AuthRequiredError, CommandExecutionError } from '@jackwener/opencli/errors';
import {
  looksLikeNaukriAuthWall,
  normalizeWhitespace,
} from './shared.js';

export const JOB_DETAIL_COLUMNS = [
  'job_id',
  'title',
  'company',
  'location',
  'experience',
  'salary',
  'posted',
  'description',
  'skills',
  'recruiter_or_posted_by',
  'company_url',
  'company_profile',
  'apply_url',
  'apply_state',
  'source_quality',
  'source_url',
  'raw_text',
];

function stripTags(value) {
  return normalizeWhitespace(String(value ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|li|div|section|article|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'"));
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

export function extractJobId(value) {
  const text = normalizeWhitespace(value);
  if (!text) return '';
  const matches = [
    text.match(/(?:job-listings|jobdetail|jobId=|jobid=|jid=)[^0-9]*(\d{6,})/i),
    text.match(/-(\d{8,})(?:[/?#]|$)/),
    text.match(/^(\d{6,})$/),
  ];
  return matches.find(Boolean)?.[1] || '';
}

export function buildDetailCandidates(input) {
  const raw = normalizeWhitespace(input);
  if (!raw) throw new ArgumentError('job-url-or-job-id is required');
  const id = extractJobId(raw);
  const urls = [];
  if (/^https:\/\/(?:www\.)?naukri\.com\//i.test(raw)) urls.push(normalizeUrl(raw));
  if (id) {
    urls.push(
      `https://www.naukri.com/jobapi/v2/job/${encodeURIComponent(id)}`,
      `https://www.naukri.com/jobapi/v1/job/${encodeURIComponent(id)}`,
      `https://www.naukri.com/jobdetail?jobId=${encodeURIComponent(id)}`,
      `https://www.naukri.com/job-listings-${encodeURIComponent(id)}`,
      `https://www.naukri.com/jobapi/v1/detail/${encodeURIComponent(id)}`,
      `https://www.naukri.com/jobapi/v3/job/${encodeURIComponent(id)}`,
    );
  }
  if (!urls.length) {
    throw new ArgumentError('job-url-or-job-id must be a Naukri URL or numeric job id');
  }
  return [...new Set(urls)];
}

function flattenObjects(value, out = []) {
  if (!value || typeof value !== 'object') return out;
  if (Array.isArray(value)) {
    for (const item of value) flattenObjects(item, out);
    return out;
  }
  out.push(value);
  for (const child of Object.values(value)) flattenObjects(child, out);
  return out;
}

function pickFirst(objects, keys) {
  for (const object of objects) {
    for (const key of keys) {
      const value = object?.[key];
      if (Array.isArray(value)) {
        const joined = value.map((item) => typeof item === 'string' ? item : item?.label || item?.name || item?.value || '').map(normalizeWhitespace).filter(Boolean).join(', ');
        if (joined) return joined;
      }
      if (value && typeof value === 'object') {
        const nested = normalizeWhitespace(value.label || value.name || value.value || value.text);
        if (nested) return nested;
      }
      const text = normalizeWhitespace(value);
      if (text) return text;
    }
  }
  return '';
}

function parseJsonScripts(html) {
  const payloads = [];
  const scriptPattern = /<script[^>]+(?:type=["']application\/ld\+json["']|id=["']__NEXT_DATA__["'])[^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(scriptPattern)) {
    const text = normalizeWhitespace(match[1]);
    if (!text || !/^[{[]/.test(text)) continue;
    try {
      payloads.push(JSON.parse(text));
    } catch {}
  }
  return payloads;
}

function textBetween(text, startPattern, endPatterns) {
  const start = text.search(startPattern);
  if (start < 0) return '';
  const rest = text.slice(start);
  let end = rest.length;
  for (const pattern of endPatterns) {
    const index = rest.search(pattern);
    if (index > 0 && index < end) end = index;
  }
  return normalizeWhitespace(rest.slice(0, end).replace(startPattern, ''));
}

function normalizeDetailFromObjects(objects, fallback = {}) {
  const description = stripTags(pickFirst(objects, [
    'description',
    'jobDescription',
    'job_description',
    'jobDesc',
    'JOBDESCR',
    'CANDPROF',
    'SEODESCP',
    'jd',
    'jobDetails',
    'jobDetail',
    'details',
    'rolesAndResponsibilities',
  ]));
  const skills = pickFirst(objects, ['skills', 'keySkills', 'tagsAndSkills', 'tags', 'keywords', 'requiredSkills', 'prefKeywords']);
  const minExp = pickFirst(objects, ['minExp', 'minimumExperience']);
  const maxExp = pickFirst(objects, ['maxExp', 'maximumExperience']);
  const minSal = pickFirst(objects, ['minSal', 'minimumSalary']);
  const maxSal = pickFirst(objects, ['maxSal', 'maximumSalary']);
  const experience = pickFirst(objects, ['experience', 'experienceText', 'minExperience', 'workExperience'])
    || (minExp && maxExp ? `${minExp}-${maxExp} Yrs` : '');
  const salary = pickFirst(objects, ['salary', 'salaryText', 'pay', 'compensation'])
    || (minSal && maxSal ? `${minSal}-${maxSal}` : '');
  return {
    job_id: normalizeWhitespace(fallback.job_id || pickFirst(objects, ['jobId', 'job_id', 'id', 'jobid'])),
    title: pickFirst(objects, ['title', 'jobTitle', 'designation', 'name', 'post']),
    company: pickFirst(objects, ['companyName', 'company', 'hiringCompany', 'hiringOrganization', 'organizationName', 'CONTCOM']),
    location: pickFirst(objects, ['location', 'locations', 'jobLocation', 'address', 'place', 'cityfield', 'CONTCITY']),
    experience,
    salary,
    posted: pickFirst(objects, ['posted', 'postedDate', 'createdDate', 'freshness', 'footerPlaceholderLabel', 'addDate', 'dateAdded']),
    description,
    skills,
    recruiter_or_posted_by: pickFirst(objects, ['recruiterName', 'postedBy', 'recruiter', 'contactPerson', 'consultantName', 'CONTCOM']),
    company_url: normalizeUrl(pickFirst(objects, ['companyUrl', 'companyProfileUrl', 'organizationUrl', 'staticCompanyName'])),
    company_profile: stripTags(pickFirst(objects, ['companyProfile', 'aboutCompany', 'companyDescription', 'descriptionOfCompany', 'COMPANY_DETAIL'])),
    apply_url: normalizeUrl(pickFirst(objects, ['applyUrl', 'apply_url', 'jobUrl', 'jdURL', 'staticUrl', 'job_static_url'])),
    apply_state: pickFirst(objects, ['applyStatus', 'apply_state', 'status']),
  };
}

function normalizeRenderedDetail(row, sourceUrl, input) {
  const detail = row && typeof row === 'object' ? row : {};
  const sourceText = normalizeWhitespace([
    detail.title,
    detail.company,
    detail.location,
    detail.experience,
    detail.salary,
    detail.description,
    detail.skills,
    detail.recruiter_or_posted_by,
    detail.company_profile,
    detail.raw_text,
  ].filter(Boolean).join(' '));
  if (looksLikeNaukriAuthWall({ url: sourceUrl, title: detail.title || '', text: sourceText })) {
    throw new AuthRequiredError('naukri.com', 'Open https://www.naukri.com in the connected browser and sign in, then retry.');
  }
  const rowOut = {
    job_id: normalizeWhitespace(detail.job_id || extractJobId(input || sourceUrl)),
    title: normalizeWhitespace(detail.title),
    company: normalizeWhitespace(detail.company),
    location: normalizeWhitespace(detail.location),
    experience: normalizeWhitespace(detail.experience),
    salary: normalizeWhitespace(detail.salary),
    posted: normalizeWhitespace(detail.posted),
    description: normalizeWhitespace(detail.description),
    skills: normalizeWhitespace(detail.skills),
    recruiter_or_posted_by: normalizeWhitespace(detail.recruiter_or_posted_by),
    company_url: normalizeUrl(detail.company_url),
    company_profile: normalizeWhitespace(detail.company_profile),
    apply_url: normalizeUrl(detail.apply_url || sourceUrl),
    apply_state: normalizeWhitespace(detail.apply_state),
    source_quality: 'rendered_detail_fallback',
    source_url: normalizeUrl(sourceUrl),
    raw_text: normalizeWhitespace(detail.raw_text).slice(0, 2000),
  };
  if (!rowOut.title && !rowOut.description && !rowOut.skills) {
    throw new CommandExecutionError('Naukri rendered job detail could not extract detail fields');
  }
  return Object.fromEntries(JOB_DETAIL_COLUMNS.map((column) => [column, normalizeWhitespace(rowOut[column])]));
}

export function parseDetailResponse(response, sourceUrl, input) {
  if (!response || typeof response !== 'object') {
    throw new CommandExecutionError('Naukri job-detail returned malformed fetch response');
  }
  const text = String(response.text || '');
  const contentType = normalizeWhitespace(response.contentType).toLowerCase();
  const jobId = extractJobId(input || sourceUrl);
  if (looksLikeNaukriAuthWall({ url: sourceUrl, title: '', text })) {
    throw new AuthRequiredError('naukri.com', 'Open https://www.naukri.com in the connected browser and sign in, then retry.');
  }
  let detail = null;
  if (contentType.includes('json') || /^[\s\n\r]*[{[]/.test(text)) {
    try {
      const payload = JSON.parse(text);
      detail = normalizeDetailFromObjects(flattenObjects(payload), { job_id: jobId });
    } catch {}
  }
  if (!detail) {
    const payloads = parseJsonScripts(text);
    detail = normalizeDetailFromObjects(flattenObjects(payloads), { job_id: jobId });
    const plain = stripTags(text);
    detail.title ||= normalizeWhitespace(plain.match(/(?:^|\s)([^.\n]{5,120}(?:Engineer|Developer|Lead|Architect|Manager)[^.\n]{0,80})/i)?.[1]);
    detail.description ||= textBetween(plain, /(?:job description|description|roles and responsibilities)\s*:?\s*/i, [
      /(?:about company|company profile|key skills|skills|education|employment type)\s*:?\s*/i,
    ]);
    detail.skills ||= textBetween(plain, /(?:key skills|skills)\s*:?\s*/i, [
      /(?:job description|description|about company|company profile|education|employment type)\s*:?\s*/i,
    ]);
  }
  const row = {
    job_id: normalizeWhitespace(detail.job_id || jobId),
    title: normalizeWhitespace(detail.title),
    company: normalizeWhitespace(detail.company),
    location: normalizeWhitespace(detail.location),
    experience: normalizeWhitespace(detail.experience),
    salary: normalizeWhitespace(detail.salary),
    posted: normalizeWhitespace(detail.posted),
    description: normalizeWhitespace(detail.description),
    skills: normalizeWhitespace(detail.skills),
    recruiter_or_posted_by: normalizeWhitespace(detail.recruiter_or_posted_by),
    company_url: normalizeUrl(detail.company_url),
    company_profile: normalizeWhitespace(detail.company_profile),
    apply_url: normalizeUrl(detail.apply_url || sourceUrl),
    apply_state: normalizeWhitespace(detail.apply_state),
    source_quality: contentType.includes('json') ? 'session_fetch_json' : 'session_fetch_html',
    source_url: normalizeUrl(sourceUrl),
    raw_text: stripTags(text).slice(0, 2000),
  };
  if (!row.title && !row.description && !row.skills) {
    throw new CommandExecutionError('Naukri job-detail could not extract detail fields from fetched response');
  }
  return Object.fromEntries(JOB_DETAIL_COLUMNS.map((column) => [column, normalizeWhitespace(row[column])]));
}

function buildSessionFetchScript(url) {
  return `
    (async () => {
      try {
        const resp = await fetch(${JSON.stringify(url)}, {
          method: 'GET',
          credentials: 'include',
          headers: {
            'Accept': 'application/json,text/html;q=0.9,*/*;q=0.8',
            'X-Requested-With': 'XMLHttpRequest'
          }
        });
        const text = await resp.text();
        return {
          ok: resp.ok,
          status: resp.status,
          statusText: resp.statusText || '',
          contentType: resp.headers.get('content-type') || '',
          url: resp.url || ${JSON.stringify(url)},
          text
        };
      } catch (e) {
        return { ok: false, status: 0, statusText: '', contentType: '', url: ${JSON.stringify(url)}, text: '', error: String((e && e.message) || e) };
      }
    })()
  `;
}

function buildRenderedDetailScript() {
  return `
    (async () => {
      const clean = (value) => String(value || '').replace(/[\\u00a0\\u202f]+/g, ' ').replace(/\\s+/g, ' ').trim();
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const visible = (el) => {
        const rect = el && el.getBoundingClientRect ? el.getBoundingClientRect() : null;
        return !!rect && rect.width > 0 && rect.height > 0;
      };
      const clickReadMore = async () => {
        const controls = Array.from(document.querySelectorAll('button, a, span, div'))
          .filter(visible)
          .filter((el) => /\\b(read more|show more|view more|more)\\b/i.test(clean(el.innerText || el.textContent || el.getAttribute('aria-label') || '')));
        for (const control of controls.slice(0, 4)) {
          try {
            control.scrollIntoView({ block: 'center', inline: 'center' });
            control.click();
            await wait(500);
          } catch (_) {}
        }
      };
      await clickReadMore();
      const bodyText = clean(document.body ? document.body.innerText || '' : '');
      const lines = bodyText.split(/\\n+/).map(clean).filter(Boolean);
      const firstText = (selectors) => {
        for (const selector of selectors) {
          const el = document.querySelector(selector);
          const text = clean(el?.innerText || el?.textContent || '');
          if (text) return text;
        }
        return '';
      };
      const textAfterHeading = (patterns, endPatterns) => {
        const index = lines.findIndex((line) => patterns.some((pattern) => pattern.test(line)));
        if (index < 0) return '';
        const collected = [];
        for (const line of lines.slice(index + 1)) {
          if (endPatterns.some((pattern) => pattern.test(line))) break;
          if (!/^read more$/i.test(line)) collected.push(line);
          if (collected.join(' ').length > 6000) break;
        }
        return clean(collected.join(' '));
      };
      const meta = firstText(['.styles_jhc__stat__PgY67', '[class*="job-stats"]', '[class*="jobStats"]']);
      const description = firstText([
        '[class*="job-desc"]',
        '[class*="jobDescription"]',
        '[class*="description"]',
        'section'
      ]) || textAfterHeading(
        [/^job description$/i, /^roles and responsibilities$/i, /^description$/i],
        [/^key skills$/i, /^about company$/i, /^company profile$/i, /^education$/i, /^employment type$/i, /^read less$/i]
      );
      const skills = firstText(['[class*="key-skill"]', '[class*="skills"]'])
        || textAfterHeading([/^key skills$/i, /^skills$/i], [/^job description$/i, /^about company$/i, /^company profile$/i, /^education$/i]);
      const companyProfile = textAfterHeading([/^about company$/i, /^company profile$/i], [/^beware of imposters$/i, /^similar jobs$/i, /^jobs you might be interested in$/i]);
      const applyLink = Array.from(document.querySelectorAll('a[href], button'))
        .map((el) => ({ href: el.href || '', text: clean(el.innerText || el.textContent || el.getAttribute('aria-label') || '') }))
        .find((item) => /\\bapply\\b/i.test(item.text));
      const companyLink = Array.from(document.querySelectorAll('a[href]'))
        .find((el) => /company|companies|overview/i.test(el.href || '') && clean(el.innerText || el.textContent || '').length > 1);
      const title = firstText(['h1', '[class*="title"]']) || lines.find((line) => /engineer|developer|lead|architect|manager|consultant|software|react|node|python|full stack|frontend|backend/i.test(line)) || '';
      const company = firstText(['[class*="company"] a', '[class*="company"]', '[class*="comp-name"]'])
        || lines.slice(1, 8).find((line) => line !== title && !/yrs?|lacs?|not disclosed|remote|hybrid|on-site|posted|apply/i.test(line)) || '';
      const jobLocation = firstText(['[class*="location"]', '[class*="loc"]'])
        || lines.find((line) => /remote|hybrid|on-site|onsite|bengaluru|bangalore|delhi|mumbai|hyderabad|pune|jaipur|gurugram|noida|chennai/i.test(line)) || '';
      return {
        job_id: clean((window.location.href || '').match(/(\\d{6,})(?:[/?#]|$)/)?.[1] || ''),
        title,
        company,
        location: jobLocation,
        experience: firstText(['[class*="experience"]', '[class*="exp"]']) || (meta.match(/\\b\\d+\\s*-\\s*\\d+\\s*(?:yrs?|years?)\\b|\\b\\d+\\s*(?:yrs?|years?)\\b/i)?.[0] || ''),
        salary: firstText(['[class*="salary"]', '[class*="sal"]']) || (meta.match(/(?:₹\\s*)?\\d+(?:\\.\\d+)?\\s*-\\s*\\d+(?:\\.\\d+)?\\s*Lacs?\\s*PA|not disclosed|₹[^\\n]+/i)?.[0] || ''),
        posted: lines.find((line) => /today|few hours ago|just now|\\d+\\s+(?:day|days|hour|hours|week|weeks|month|months)\\s+ago/i.test(line)) || '',
        description,
        skills,
        recruiter_or_posted_by: lines.find((line) => /^posted by\\b/i.test(line)) || '',
        company_url: companyLink?.href || '',
        company_profile: companyProfile,
        apply_url: applyLink?.href || window.location.href,
        apply_state: applyLink?.text || '',
        raw_text: bodyText.slice(0, 5000),
      };
    })()
  `;
}

cli({
  site: 'naukri',
  name: 'job-detail',
  access: 'read',
  description: 'Read one Naukri job detail through direct session-authenticated fetch, without UI clicking',
  domain: 'www.naukri.com',
  strategy: Strategy.COOKIE,
  browser: true,
  navigateBefore: 'https://www.naukri.com',
  args: [
    { name: 'job-url-or-job-id', type: 'string', required: true, positional: true, help: 'Naukri job detail URL or numeric job id from recommended-jobs/search output' },
    { name: 'transport', type: 'string', default: 'session-fetch', choices: ['session-fetch'], help: 'Detail transport. session-fetch reuses browser session cookies without pointer automation.' },
  ],
  columns: JOB_DETAIL_COLUMNS,
  func: async (page, args) => {
    if (!page) throw new CommandExecutionError('Browser session required for naukri job-detail session-fetch');
    const input = normalizeWhitespace(args['job-url-or-job-id']);
    const candidates = buildDetailCandidates(input);
    const failures = [];
    let authWallCount = 0;
    for (const url of candidates) {
      const response = await page.evaluate(buildSessionFetchScript(url));
      if (response?.error) {
        failures.push(`${url}: ${response.error}`);
        continue;
      }
      if (!response?.ok) {
        failures.push(`${url}: HTTP ${response?.status || 0}`);
        continue;
      }
      try {
        return [parseDetailResponse(response, response.url || url, input)];
      } catch (error) {
        if (error instanceof AuthRequiredError) authWallCount += 1;
        failures.push(`${url}: ${error.message}`);
      }
    }
    const renderedCandidates = candidates.filter((url) => !/\/jobapi\//i.test(url));
    for (const url of renderedCandidates) {
      try {
        await page.goto(url);
        await page.wait(3);
        const row = await page.evaluate(buildRenderedDetailScript());
        return [normalizeRenderedDetail(row, url, input)];
      } catch (error) {
        if (error instanceof AuthRequiredError) authWallCount += 1;
        failures.push(`${url}: rendered fallback failed: ${error.message}`);
      }
    }
    if (authWallCount > 0 && authWallCount >= failures.length) {
      throw new AuthRequiredError('naukri.com', 'Open https://www.naukri.com in the connected browser and sign in, then retry.');
    }
    throw new CommandExecutionError(`Naukri job-detail could not fetch usable detail. Attempts: ${failures.slice(0, 5).join(' | ')}`);
  },
});

export const __test__ = {
  buildDetailCandidates,
  buildRenderedDetailScript,
  extractJobId,
  normalizeRenderedDetail,
  parseDetailResponse,
};
