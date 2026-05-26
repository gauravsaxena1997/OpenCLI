import { AuthRequiredError, CommandExecutionError, ArgumentError } from '@jackwener/opencli/errors';

export const NAUKRI_PROFILE_URL = 'https://www.naukri.com/mnjuser/profile';
export const IT_SKILLS_LIMIT = 10;

export const PROFILE_COLUMNS = [
  'profile_url',
  'name',
  'current_title',
  'current_company',
  'profile_last_updated',
  'profile_completion',
  'photo_status',
  'location',
  'total_experience',
  'current_salary',
  'phone',
  'email',
  'notice_status',
  'resume_file',
  'resume_uploaded_on',
  'resume_headline',
  'key_skills',
  'employment',
  'education',
  'it_skills',
  'projects',
  'profile_summary',
  'accomplishments',
  'career_profile',
  'personal_details',
  'diversity_inclusion',
];

const SECTION_LABELS = [
  'Resume',
  'Resume headline',
  'Key skills',
  'Employment',
  'Education',
  'IT skills',
  'Projects',
  'Profile summary',
  'Accomplishments',
  'Career profile',
  'Personal details',
  'Diversity & inclusion',
];

export function normalizeWhitespace(value) {
  return String(value ?? '')
    .replace(/[\u00a0\u202f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function requireText(value, fieldName, maxLength) {
  const text = normalizeWhitespace(value);
  if (!text) throw new ArgumentError(`${fieldName} is required`);
  if (maxLength && text.length > maxLength) {
    throw new ArgumentError(`${fieldName} must be <= ${maxLength} characters`, `Current length: ${text.length}`);
  }
  return text;
}

function cleanLines(text) {
  return String(text ?? '')
    .split(/\n+/)
    .map(normalizeWhitespace)
    .filter(Boolean);
}

function lineMatchesLabel(line, label) {
  if (label === 'Resume') return line === label;
  return line === label || line.startsWith(`${label} `) || line.startsWith(`${label}editOneTheme`);
}

function findLastSectionIndex(lines, label) {
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lineMatchesLabel(lines[i], label)) return i;
  }
  return -1;
}

function findNextSectionIndex(lines, startIndex) {
  for (let i = startIndex + 1; i < lines.length; i++) {
    if (SECTION_LABELS.some((label) => lineMatchesLabel(lines[i], label))) return i;
  }
  return lines.length;
}

function stripLeadingSectionLabel(text, label) {
  const value = normalizeWhitespace(text);
  if (value === label) return '';
  if (value.startsWith(`${label} `)) return normalizeWhitespace(value.slice(label.length));
  if (value.startsWith(`${label}editOneTheme`)) return normalizeWhitespace(value.slice(label.length));
  return value;
}

export function normalizeSkillList(values) {
  const seen = new Set();
  const rows = Array.isArray(values) ? values : String(values ?? '').split(/[,;\n]+/);
  return rows
    .map(normalizeWhitespace)
    .filter(Boolean)
    .filter((skill) => {
      const key = skill.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function parseExperience(value) {
  const text = normalizeWhitespace(value);
  if (!text || text === '-') return { years: '', months: '' };
  const yearsMatch = text.match(/(\d+)\s+Years?/i);
  const monthsMatch = text.match(/(\d+)\s+Months?/i);
  return {
    years: yearsMatch?.[1] || '0',
    months: monthsMatch?.[1] || '0',
  };
}

export function normalizeItSkillRows(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const experience = parseExperience(row?.experience);
      return {
        id: normalizeWhitespace(row?.id),
        skill: normalizeWhitespace(row?.skill),
        version: normalizeWhitespace(row?.version === '-' ? '' : row?.version),
        last_used: normalizeWhitespace(row?.last_used === '-' ? '' : row?.last_used),
        experience_years: normalizeWhitespace(row?.experience_years ?? experience.years),
        experience_months: normalizeWhitespace(row?.experience_months ?? experience.months),
      };
    })
    .filter((row) => row.skill);
}

export function normalizeItSkillItem(item) {
  const row = typeof item === 'string' ? { skill: item } : item || {};
  const years = normalizeWhitespace(row.years ?? row.experience_years ?? row.year ?? '');
  const months = normalizeWhitespace(row.months ?? row.experience_months ?? row.month ?? '');
  return {
    skill: requireText(row.skill, 'skill', 80),
    version: normalizeWhitespace(row.version),
    last_used: normalizeWhitespace(row.last_used ?? row.lastUsed ?? ''),
    experience_years: years === '' ? '0' : years,
    experience_months: months === '' ? '0' : months,
  };
}

export function parseItSkillItems(value) {
  let parsed;
  try {
    parsed = JSON.parse(String(value ?? ''));
  } catch (error) {
    throw new ArgumentError('--items must be a JSON array', error.message);
  }
  if (!Array.isArray(parsed) || !parsed.length) {
    throw new ArgumentError('--items must be a non-empty JSON array');
  }
  const seen = new Set();
  const items = parsed.map(normalizeItSkillItem).filter((item) => {
    const key = item.skill.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (items.length > IT_SKILLS_LIMIT) {
    throw new ArgumentError(
      `Naukri IT skills supports at most ${IT_SKILLS_LIMIT} rows`,
      `Received ${items.length}. Remove lower-priority skills before running it-skills-set.`,
    );
  }
  return items;
}

export function compareItSkillRows(expected, actual) {
  const expectedRows = (Array.isArray(expected) ? expected : []).map(normalizeItSkillItem);
  const actualRows = normalizeItSkillRows(actual);
  const key = (value) => normalizeWhitespace(value).toLowerCase();
  const comparableRow = (row) => [
    key(row.skill),
    key(row.version),
    String(row.experience_years ?? ''),
    String(row.experience_months ?? ''),
  ].join('|');
  const actualKeys = new Set(actualRows.map(comparableRow));
  const expectedKeys = new Set(expectedRows.map(comparableRow));
  return {
    missing: expectedRows.filter((row) => !actualKeys.has(comparableRow(row))).map((row) => row.skill),
    extra: actualRows.filter((row) => !expectedKeys.has(comparableRow(row))).map((row) => row.skill),
  };
}

function readSection(lines, label) {
  const index = findLastSectionIndex(lines, label);
  if (index < 0) return '';
  const nextIndex = findNextSectionIndex(lines, index);
  const chunk = lines.slice(index, nextIndex).join(' ');
  return stripLeadingSectionLabel(chunk, label)
    .replace(/\beditOneTheme\b/g, '')
    .replace(/\bAdd details\b/g, '')
    .replace(/\bAdd project\b/g, '')
    .replace(/\bAdd employment\b/g, '')
    .replace(/\bAdd education\b/g, '')
    .replace(/\bAdd link to online professional profiles \(e\.g\. LinkedIn, etc\.\)\b/g, '')
    .replace(/\[Read More\]\(javascript:;\)/g, '')
    .replace(/\[Add\]\(javascript(?::void\(0\))?;?\)/g, '')
    .replace(/\[Add more info\]\(javascript:void\(0\)\)/g, '')
    .replace(/\[Add languages\]\(javascript:void\(0\)\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractProfileHeader(lines) {
  const quickLinksIndex = lines.findIndex((line) => line === 'Quick links');
  const headerLines = lines.slice(0, quickLinksIndex > 0 ? quickLinksIndex : lines.length);
  const lastUpdatedLine = headerLines.find((line) => /^Profile last updated\s*-/i.test(line)) || '';
  const completion = headerLines.find((line) => /^\d+\s*%$/.test(line)) || '';
  const photoStatus = headerLines.find((line) => /approval pending|approved|rejected/i.test(line)) || '';
  const email = headerLines.find((line) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(line)) || '';
  const phone = headerLines.find((line) => /^\+?\d[\d\s-]{7,}$/.test(line)) || '';
  const location = headerLines.find((line) => /,\s*(india|usa|united states|uk|canada)\b/i.test(line)) || '';
  const totalExperience = headerLines.find((line) => /Year\(s\)|Month\(s\)|\bYears?\b|\bMonths?\b/i.test(line)) || '';
  const currentSalary = headerLines.find((line) => /₹|\brs\.?\b|\binr\b|lakh|crore/i.test(line)) || '';
  const noticeStatus = headerLines.find((line) => /notice period|serving notice|available/i.test(line)) || '';
  const profileUpdatedIndex = headerLines.findIndex((line) => /^Profile last updated\s*-/i.test(line));
  const introLines = headerLines
    .slice(0, profileUpdatedIndex > 0 ? profileUpdatedIndex : headerLines.length)
    .filter((line) => line && !/naukri|jobs|companies|services|search jobs|approval pending|editOneTheme|locationOt|experienceOneTheme|walletOneTheme|phoneOneTheme|verifiedOneTheme|mailOneTheme|calenderOneTheme|^\d+\s*%$|^\d+$/i.test(line))
    .filter((line) => !line.includes('@'))
    .filter((line) => !/^\+?\d[\d\s-]{7,}$/.test(line))
    .filter((line) => !/,\s*(india|usa|united states|uk|canada)\b/i.test(line))
    .filter((line) => !/Year\(s\)|Month\(s\)|\bYears?\b|\bMonths?\b/i.test(line))
    .filter((line) => !/₹|\brs\.?\b|\binr\b|lakh|crore/i.test(line));
  const atIndex = introLines.findIndex((line) => /^at\s+/i.test(line));
  const name = atIndex >= 2 ? introLines[atIndex - 2] : '';
  const roleLine = atIndex >= 1 ? introLines[atIndex - 1] : '';
  const companyLine = atIndex >= 0 ? introLines[atIndex] : '';
  const currentCompany = /^at\s+/i.test(companyLine) ? companyLine.replace(/^at\s+/i, '') : companyLine;

  return {
    name,
    current_title: roleLine,
    current_company: currentCompany,
    profile_last_updated: lastUpdatedLine.replace(/^Profile last updated\s*-\s*/i, ''),
    profile_completion: completion,
    photo_status: photoStatus,
    location,
    total_experience: totalExperience,
    current_salary: currentSalary,
    phone,
    email,
    notice_status: noticeStatus,
  };
}

export function parseResumeSection(text) {
  const resume = normalizeWhitespace(text);
  const uploadedMatch = resume.match(/\bUploaded on\s+(.+?)(?:\s+(?:downloadOneTheme|deleteOneTheme|Choose file|Update resume|Supported Formats)|$)/i);
  const beforeUpload = uploadedMatch ? resume.slice(0, uploadedMatch.index).trim() : resume;
  const resumeFile = beforeUpload.split(/\s+/).find((part) => /\.pdf$|\.docx?$|\.rtf$/i.test(part)) || beforeUpload;
  return {
    resume_file: normalizeWhitespace(resumeFile),
    resume_uploaded_on: normalizeWhitespace(uploadedMatch?.[1] || ''),
  };
}

export function parseNaukriProfileText(payload) {
  const text = typeof payload === 'string' ? payload : payload?.text;
  const lines = cleanLines(text);
  const url = normalizeWhitespace(typeof payload === 'object' ? payload?.url : '');
  const title = normalizeWhitespace(typeof payload === 'object' ? payload?.title : '');
  const fullText = normalizeWhitespace(text).toLowerCase();
  if (!lines.length) {
    throw new CommandExecutionError('Naukri profile-read could not read page text');
  }
  if (/login|sign in/.test(title.toLowerCase()) && !/profile|resume headline|key skills/.test(fullText)) {
    throw new AuthRequiredError('naukri.com', 'Open https://www.naukri.com in the connected browser and sign in, then retry.');
  }

  const header = extractProfileHeader(lines);
  const resume = parseResumeSection(readSection(lines, 'Resume'));
  const keySkills = normalizeSkillList(typeof payload === 'object' ? payload?.keySkills : []);
  const row = {
    profile_url: url,
    ...header,
    ...resume,
    resume_headline: readSection(lines, 'Resume headline'),
    key_skills: keySkills.length ? keySkills.join(', ') : readSection(lines, 'Key skills'),
    employment: readSection(lines, 'Employment'),
    education: readSection(lines, 'Education'),
    it_skills: readSection(lines, 'IT skills'),
    projects: readSection(lines, 'Projects'),
    profile_summary: readSection(lines, 'Profile summary'),
    accomplishments: readSection(lines, 'Accomplishments'),
    career_profile: readSection(lines, 'Career profile'),
    personal_details: readSection(lines, 'Personal details'),
    diversity_inclusion: readSection(lines, 'Diversity & inclusion'),
  };

  if (!row.name && !row.resume_headline && !row.key_skills) {
    throw new CommandExecutionError('Naukri profile-read could not find profile fields; the page structure may have changed.');
  }
  return Object.fromEntries(PROFILE_COLUMNS.map((column) => [column, normalizeWhitespace(row[column])]));
}

export function buildProfileExtractionScript() {
  return String.raw`(() => ({
    url: window.location.href,
    title: document.title || '',
    text: document.body ? document.body.innerText || '' : '',
    keySkills: Array.from(document.querySelectorAll('#lazyKeySkills .chip'))
      .map((el) => (el.getAttribute('title') || el.innerText || el.textContent || '').trim())
      .filter(Boolean),
    itSkills: Array.from(document.querySelectorAll('#lazyITSkills li.collection[data-prefillid]'))
      .map((row) => {
        const cells = Array.from(row.querySelectorAll('span.col'));
        return {
          id: row.getAttribute('data-prefillid') || '',
          skill: (cells[0]?.innerText || cells[0]?.textContent || '').trim(),
          version: (cells[1]?.innerText || cells[1]?.textContent || '').trim(),
          last_used: (cells[2]?.innerText || cells[2]?.textContent || '').trim(),
          experience: (cells[3]?.innerText || cells[3]?.textContent || '').trim(),
        };
      })
      .filter((row) => row.skill)
  }))()`;
}

export async function readProfile(page) {
  await page.evaluate(String.raw`(() => {
    for (const link of Array.from(document.querySelectorAll('a.morelink, .morelink'))) {
      const text = String(link.innerText || link.textContent || '').trim();
      if (/read more/i.test(text)) {
        try {
          link.scrollIntoView({ block: 'center', inline: 'center' });
          link.click();
        } catch (_) {}
      }
    }
    return true;
  })()`).catch(() => undefined);
  await page.wait(1);
  const payload = await page.evaluate(buildProfileExtractionScript());
  return parseNaukriProfileText(payload);
}

export async function readKeySkills(page) {
  await ensureProfilePage(page);
  const payload = await page.evaluate(buildProfileExtractionScript());
  const chipSkills = normalizeSkillList(payload?.keySkills || []);
  if (chipSkills.length) return chipSkills;
  return normalizeSkillList(parseNaukriProfileText(payload).key_skills);
}

export async function readItSkills(page) {
  await ensureProfilePage(page);
  const payload = await page.evaluate(buildProfileExtractionScript());
  const rows = normalizeItSkillRows(payload?.itSkills || []);
  if (rows.length) return rows;
  return [];
}

export async function ensureProfilePage(page) {
  if (!page) throw new CommandExecutionError('Browser session required for Naukri profile commands');
  await page.goto(NAUKRI_PROFILE_URL);
  await page.wait(5);
  if (typeof page.scroll === 'function') {
    for (let i = 0; i < 8; i++) {
      await page.scroll('down', 900);
      await page.wait(0.4);
    }
  }
  if (typeof page.autoScroll === 'function') {
    await page.autoScroll({ times: 12, delayMs: 500 });
    await page.wait(1);
  }
}

export function buildOpenTextSectionEditorScript(sectionLabel, text) {
  return `
    (() => {
      const sectionLabel = ${JSON.stringify(sectionLabel)};
      const expectedText = ${JSON.stringify(text)};
      const clean = (value) => String(value || '').replace(/[\\u00a0\\u202f]+/g, ' ').replace(/\\s+/g, ' ').trim();
      const knownSectionIds = {
        'Resume headline': 'lazyResumeHead',
        'Profile summary': 'lazyProfileSummary',
      };
      const knownSection = knownSectionIds[sectionLabel] ? document.getElementById(knownSectionIds[sectionLabel]) : null;
      if (knownSection) {
        const edit = knownSection.querySelector('.widgetHead .edit.icon, .edit.icon, [class*="edit"]');
        if (!edit) return { ok: false, error: 'edit_control_not_found' };
        edit.scrollIntoView({ block: 'center', inline: 'center' });
        edit.click();
        window.__opencli_naukri_pending_text = expectedText;
        return { ok: true };
      }
      const labelMatches = (el) => clean(el.innerText || el.textContent) === sectionLabel;
      const labelStarts = (el) => {
        const value = clean(el.innerText || el.textContent);
        return value === sectionLabel || value.startsWith(sectionLabel + ' ') || value.startsWith(sectionLabel + 'editOneTheme');
      };
      const heading = Array.from(document.querySelectorAll('h1,h2,h3,h4,span,div,p'))
        .find((el) => labelStarts(el));
      if (!heading) return { ok: false, error: 'section_not_found' };

      let section = heading;
      for (let i = 0; i < 8 && section.parentElement; i++) {
        section = section.parentElement;
        const text = clean(section.innerText || section.textContent);
        if (text.includes(sectionLabel) && text.length > sectionLabel.length && text.length < 6000) break;
      }

      const editCandidates = Array.from(section.querySelectorAll('button,a,[role="button"],[class*="edit"],[class*="Edit"],i,span,svg'))
        .filter((el) => /edit|pencil/i.test(clean(el.innerText || el.textContent) + ' ' + Array.from(el.classList || []).join(' ') + ' ' + (el.getAttribute('aria-label') || '') + ' ' + (el.getAttribute('title') || '')));
      const edit = editCandidates[0];
      if (!edit) return { ok: false, error: 'edit_control_not_found' };
      edit.scrollIntoView({ block: 'center', inline: 'center' });
      edit.click();
      window.__opencli_naukri_pending_text = expectedText;
      return { ok: true };
    })()
  `;
}

export function buildFillActiveDialogTextScript(text) {
  return `
    (() => {
      const expectedText = ${JSON.stringify(text)};
      const clean = (value) => String(value || '').replace(/[\\u00a0\\u202f]+/g, ' ').replace(/\\s+/g, ' ').trim();
      const visible = (el) => {
        const rect = el && el.getBoundingClientRect ? el.getBoundingClientRect() : null;
        return !!rect && rect.width > 0 && rect.height > 0;
      };
      const roots = Array.from(document.querySelectorAll('[role="dialog"], .modal, [class*="modal"], [class*="Modal"], [class*="drawer"], [class*="Drawer"]')).filter(visible);
      const root = roots[roots.length - 1] || document;
      const fields = Array.from(root.querySelectorAll('textarea,input[type="text"],input:not([type]),[contenteditable="true"]')).filter(visible);
      const field = fields.find((el) => {
        const type = (el.getAttribute('type') || '').toLowerCase();
        return type !== 'file' && type !== 'hidden' && !el.disabled && !el.readOnly;
      });
      if (!field) return { ok: false, error: 'text_field_not_found' };

      const setValue = (el, value) => {
        if (el.isContentEditable) {
          el.focus();
          el.textContent = value;
          el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
          return clean(el.innerText || el.textContent);
        }
        const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
        descriptor.set.call(el, value);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return clean(el.value);
      };
      const actual = setValue(field, expectedText);
      return { ok: actual === clean(expectedText), actual };
    })()
  `;
}

export function buildSaveActiveDialogScript() {
  return String.raw`(() => {
    const clean = (value) => String(value || '').replace(/[\u00a0\u202f]+/g, ' ').replace(/\s+/g, ' ').trim();
    const visible = (el) => {
      const rect = el && el.getBoundingClientRect ? el.getBoundingClientRect() : null;
      return !!rect && rect.width > 0 && rect.height > 0;
    };
    const roots = Array.from(document.querySelectorAll('[role="dialog"], .modal, [class*="modal"], [class*="Modal"], [class*="drawer"], [class*="Drawer"]')).filter(visible);
    const root = roots[roots.length - 1] || document;
    const buttons = Array.from(root.querySelectorAll('button,a,[role="button"],input[type="submit"]')).filter(visible);
    const save = buttons.find((el) => /^(save|update|submit|done)$/i.test(clean(el.innerText || el.value || el.textContent)));
    if (!save) return { ok: false, error: 'save_control_not_found' };
    save.click();
    return { ok: true };
  })()`;
}

export function buildKeySkillSuggestionScript(query, limit) {
  return `
    (async () => {
      const query = ${JSON.stringify(query)};
      const limit = ${Number(limit) || 10};
      const clean = (value) => String(value || '').replace(/[\\u00a0\\u202f]+/g, ' ').replace(/\\s+/g, ' ').trim();
      const visible = (el) => {
        const rect = el && el.getBoundingClientRect ? el.getBoundingClientRect() : null;
        return !!rect && rect.width > 0 && rect.height > 0;
      };
      window.__opencli_naukri_skill_requests = [];
      const requests = window.__opencli_naukri_skill_requests;
      if (!window.__opencli_naukri_skill_request_patch) {
        const fetchOriginal = window.fetch;
        window.fetch = async function(input, init) {
          const url = typeof input === 'string' ? input : input && input.url;
          const method = (init && init.method) || (input && input.method) || 'GET';
          const response = await fetchOriginal.apply(this, arguments);
          try {
            const body = await response.clone().text();
            if (/skill|suggest|autocomplete|keyword|taxonomy/i.test(String(url) + ' ' + body.slice(0, 500))) {
              window.__opencli_naukri_skill_requests.push({ type: 'fetch', method, url: String(url), status: response.status, body: body.slice(0, 1000) });
            }
          } catch (_) {}
          return response;
        };
        const openOriginal = XMLHttpRequest.prototype.open;
        const sendOriginal = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.open = function(method, url) {
          this.__opencliNaukriUrl = url;
          this.__opencliNaukriMethod = method;
          return openOriginal.apply(this, arguments);
        };
        XMLHttpRequest.prototype.send = function(body) {
          this.addEventListener('load', function() {
            try {
              const text = this.responseText || '';
              if (/skill|suggest|autocomplete|keyword|taxonomy/i.test(String(this.__opencliNaukriUrl) + ' ' + text.slice(0, 500))) {
                window.__opencli_naukri_skill_requests.push({ type: 'xhr', method: this.__opencliNaukriMethod, url: String(this.__opencliNaukriUrl), status: this.status, body: text.slice(0, 1000) });
              }
            } catch (_) {}
          });
          return sendOriginal.apply(this, arguments);
        };
        window.__opencli_naukri_skill_request_patch = true;
      }

      const section = document.getElementById('lazyKeySkills');
      if (!section) return { ok: false, error: 'key_skills_section_not_found', suggestions: [], requests };
      const edit = section.querySelector('.widgetHead .edit.icon, .edit.icon, [class*="edit"]');
      if (!edit) return { ok: false, error: 'edit_control_not_found', suggestions: [], requests };
      edit.scrollIntoView({ block: 'center', inline: 'center' });
      edit.click();
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const roots = Array.from(document.querySelectorAll('[role="dialog"], .modal, [class*="modal"], [class*="Modal"], [class*="drawer"], [class*="Drawer"]')).filter(visible);
      const root = roots[roots.length - 1] || document;
      const fields = Array.from(root.querySelectorAll('input[type="text"],input:not([type]),textarea,[contenteditable="true"]')).filter(visible);
      const field = fields.find((el) => /skill/i.test(clean(el.getAttribute('placeholder') || el.getAttribute('name') || el.id || el.getAttribute('aria-label')))) || fields[0];
      if (!field) return { ok: false, error: 'skill_input_not_found', suggestions: [], requests };

      const setValue = (el, value) => {
        el.focus();
        if (el.isContentEditable) {
          el.textContent = value;
          el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
          return;
        }
        const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
        descriptor.set.call(el, value);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: value.slice(-1) || 'a' }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      };
      setValue(field, query);
      await new Promise((resolve) => setTimeout(resolve, 1800));

      const suggestionSelectors = [
        '[role="option"]',
        '[class*="suggest"] li',
        '[class*="Suggest"] li',
        '[class*="autocomplete"] li',
        '[class*="Autocomplete"] li',
        '.dropdown-content li',
        'ul li'
      ];
      const addUnique = (list, text) => {
        const value = clean(text);
        if (!value || value.length > 120) return;
        if (!value.toLowerCase().includes(query.toLowerCase())) return;
        if (/\\b(jobs|recommended jobs|application status|saved jobs|nvites)\\b/i.test(value)) return;
        if (/\\beditOneTheme\\b|\\b\\d{4}\\b|\\bYears?\\b|\\bMonths?\\b/i.test(value)) return;
        if (!list.some((item) => item.toLowerCase() === value.toLowerCase())) list.push(value);
      };
      const collectStrings = (value, list) => {
        if (typeof value === 'string') {
          addUnique(list, value);
          return;
        }
        if (Array.isArray(value)) {
          value.forEach((item) => collectStrings(item, list));
          return;
        }
        if (value && typeof value === 'object') {
          for (const [key, item] of Object.entries(value)) {
            if (/name|label|title|value|skill|keyword|display/i.test(key)) collectStrings(item, list);
            else if (Array.isArray(item) || (item && typeof item === 'object')) collectStrings(item, list);
          }
        }
      };
      const networkSuggestions = [];
      for (const request of requests) {
        try {
          collectStrings(JSON.parse(request.body), networkSuggestions);
        } catch (_) {
          addUnique(networkSuggestions, request.body);
        }
      }
      const domSuggestions = [];
      for (const selector of suggestionSelectors) {
        for (const el of Array.from(document.querySelectorAll(selector)).filter(visible)) {
          addUnique(domSuggestions, el.innerText || el.textContent);
        }
      }
      const close = Array.from(root.querySelectorAll('button,a,[role="button"],span')).filter(visible)
        .find((el) => /^(cancel|close|crosslayer|×|x)$/i.test(clean(el.innerText || el.textContent || el.getAttribute('aria-label'))));
      if (close) close.click();
      const resourceUrls = performance.getEntriesByType('resource')
        .map((entry) => entry.name)
        .filter((url) => /skill|suggest|autocomplete|keyword|taxonomy/i.test(url))
        .filter((url) => !/analytics\\.google|google-analytics|\\/g\\/collect|doubleclick|googletagmanager/i.test(url));
      const requestUrls = requests
        .map((request) => request.url)
        .filter((url) => !/analytics\\.google|google-analytics|\\/g\\/collect|doubleclick|googletagmanager/i.test(url));
      const source = networkSuggestions.length ? 'autocomplete-network' : 'autocomplete-dom';
      const suggestions = networkSuggestions.length ? networkSuggestions : domSuggestions;
      return { ok: true, suggestions: suggestions.slice(0, limit), source, endpoint: requestUrls[0] || resourceUrls[0] || '', requests };
    })()
  `;
}

export function buildItSkillSuggestionScript(query, limit) {
  return `
    (async () => {
      const query = ${JSON.stringify(query)};
      const limit = ${Number(limit) || 10};
      const clean = (value) => String(value || '').replace(/[\\u00a0\\u202f]+/g, ' ').replace(/\\s+/g, ' ').trim();
      const visible = (el) => {
        const rect = el && el.getBoundingClientRect ? el.getBoundingClientRect() : null;
        return !!rect && rect.width > 0 && rect.height > 0;
      };
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const section = document.getElementById('lazyITSkills');
      if (!section) return { ok: false, error: 'it_skills_section_not_found', suggestions: [] };
      section.scrollIntoView({ block: 'center', inline: 'center' });
      await wait(400);
      const add = Array.from(section.querySelectorAll('button,a,[role="button"],span,div'))
        .filter(visible)
        .find((el) => /^add$/i.test(clean(el.innerText || el.textContent)) || /add/i.test(clean(el.getAttribute('aria-label') || el.getAttribute('title') || Array.from(el.classList || []).join(' '))));
      if (!add) return { ok: false, error: 'add_control_not_found', suggestions: [] };
      add.click();
      await wait(1000);

      const root = Array.from(document.querySelectorAll('#itSkillsForm, [role="dialog"], .modal, [class*="modal"], [class*="Modal"], [class*="drawer"], [class*="Drawer"]'))
        .filter(visible).at(-1) || document;
      const field = root.querySelector('#itSkillSugg') || Array.from(root.querySelectorAll('input[type="text"],input:not([type])')).filter(visible)
        .find((el) => /skill|software/i.test(clean(el.placeholder || el.name || el.id)));
      if (!field) return { ok: false, error: 'skill_input_not_found', suggestions: [] };
      const setValue = (el, value) => {
        el.focus();
        const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
        descriptor.set.call(el, value);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: value.slice(-1) || 'a' }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      };
      setValue(field, query);
      await wait(1400);

      const addUnique = (list, text) => {
        const value = clean(text);
        if (!value || value.length > 120) return;
        if (!value.toLowerCase().includes(query.toLowerCase())) return;
        if (/jobs|recommended jobs|application status|saved jobs|editOneTheme/i.test(value)) return;
        if (!list.some((item) => item.toLowerCase() === value.toLowerCase())) list.push(value);
      };
      const suggestions = [];
      for (const el of Array.from(document.querySelectorAll('[role="option"], [class*="suggest"] li, [class*="Suggest"] li, [class*="autocomplete"] li, [class*="Autocomplete"] li, .dropdown-content li, ul li')).filter(visible)) {
        addUnique(suggestions, el.innerText || el.textContent);
      }
      const cancel = Array.from(root.querySelectorAll('button,a,[role="button"],span')).filter(visible)
        .find((el) => /^(cancel|close|crosslayer|×|x)$/i.test(clean(el.innerText || el.textContent || el.getAttribute('aria-label'))));
      if (cancel) cancel.click();
      return { ok: true, suggestions: suggestions.slice(0, limit), source: 'autocomplete-dom' };
    })()
  `;
}

export function buildUpsertItSkillScript(item, matchSkill = '') {
  return `
    (async () => {
      const item = ${JSON.stringify(item)};
      const matchSkill = ${JSON.stringify(matchSkill)};
      const clean = (value) => String(value || '').replace(/[\\u00a0\\u202f]+/g, ' ').replace(/\\s+/g, ' ').trim();
      const comparable = (value) => clean(value).toLowerCase().replace(/\\.js\\b/g, 'js').replace(/[^a-z0-9]+/g, '');
      const visible = (el) => {
        const rect = el && el.getBoundingClientRect ? el.getBoundingClientRect() : null;
        return !!rect && rect.width > 0 && rect.height > 0;
      };
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const setValue = (el, value) => {
        if (!el) return false;
        el.focus();
        const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
        descriptor.set.call(el, value == null ? '' : String(value));
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: String(value || '').slice(-1) || 'a' }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      };
      const roots = () => Array.from(document.querySelectorAll('#itSkillsForm, [role="dialog"], .modal, [class*="modal"], [class*="Modal"], [class*="drawer"], [class*="Drawer"]')).filter(visible);
      const root = () => roots().at(-1) || document;
      const section = document.getElementById('lazyITSkills');
      if (!section) return { ok: false, error: 'it_skills_section_not_found' };
      section.scrollIntoView({ block: 'center', inline: 'center' });
      await wait(400);
      const rows = Array.from(section.querySelectorAll('li.collection[data-prefillid]'));
      const row = rows.find((entry) => {
        const skill = clean(entry.querySelector('span.col')?.innerText || entry.querySelector('span.col')?.textContent);
        return comparable(skill) === comparable(matchSkill || item.skill);
      });
      if (row) {
        row.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
        row.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
        await wait(200);
        const edit = row.querySelector('.edit, [class*="edit"], [class*="Edit"], [class*="pencil"], [title*="Edit"], [aria-label*="Edit"]')
          || Array.from(row.querySelectorAll('button,a,[role="button"],span,i,em,div'))
          .find((el) => /edit|pencil/i.test(clean(el.innerText || el.textContent || el.getAttribute('aria-label') || el.getAttribute('title') || Array.from(el.classList || []).join(' '))));
        if (!edit) return { ok: false, error: 'edit_control_not_found' };
        edit.click();
      } else {
        const add = Array.from(section.querySelectorAll('button,a,[role="button"],span,div')).filter(visible)
          .find((el) => /^add$/i.test(clean(el.innerText || el.textContent)) || /add/i.test(clean(el.getAttribute('aria-label') || el.getAttribute('title') || Array.from(el.classList || []).join(' '))));
        if (!add) return { ok: false, error: 'add_control_not_found' };
        add.click();
      }
      await wait(1000);
      const form = root();
      const skillField = form.querySelector('#itSkillSugg') || Array.from(form.querySelectorAll('input[type="text"],input:not([type])')).filter(visible)
        .find((el) => /skill|software/i.test(clean(el.placeholder || el.name || el.id)));
      const versionField = form.querySelector('#version') || Array.from(form.querySelectorAll('input[type="text"],input:not([type])')).filter(visible)
        .find((el) => /version/i.test(clean(el.placeholder || el.name || el.id)));
      if (!skillField) return { ok: false, error: 'skill_input_not_found' };
      setValue(skillField, item.skill);
      await wait(700);
      const options = Array.from(document.querySelectorAll('[role="option"], [class*="suggest"] li, [class*="Suggest"] li, [class*="autocomplete"] li, [class*="Autocomplete"] li, .dropdown-content li, ul li'))
        .filter(visible)
        .map((el) => ({ el, text: clean(el.innerText || el.textContent) }))
        .filter((option) => option.text && option.text.length <= 120 && !/jobs|recommended jobs|application status|saved jobs|editOneTheme/i.test(option.text));
      const choice = options.find((option) => comparable(option.text) === comparable(item.skill))
        || options.find((option) => comparable(option.text).includes(comparable(item.skill)) || comparable(item.skill).includes(comparable(option.text)));
      if (!row && choice) {
        choice.el.click();
        await wait(400);
      }
      if (versionField) setValue(versionField, item.version || '');

      const selectDroope = async (id, value) => {
        const desired = clean(value);
        if (!desired) return true;
        const dropdown = form.querySelector('#' + id);
        const field = form.querySelector('#' + id + 'For') || dropdown?.querySelector('input[type="text"]');
        if (!field) return false;
        const mouseSelect = (el) => {
          for (const type of ['pointerdown', 'mousedown', 'mouseup', 'click']) {
            el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
          }
        };
        field.click();
        await wait(250);
        const scopedRoot = dropdown || form;
        const choices = Array.from(scopedRoot.querySelectorAll('a, [role="option"], li')).filter(visible)
          .map((el) => ({ el, text: clean(el.innerText || el.textContent), id: clean(el.getAttribute('data-id') || el.id) }))
          .filter((option) => option.text || option.id);
        const picked = choices.find((option) => option.text === desired || option.id.endsWith('_' + desired))
          || choices.find((option) => option.text.startsWith(desired + ' ') || option.text === desired + ' Years' || option.text === desired + ' Months');
        if (!picked) return false;
        mouseSelect(picked.el.closest('li') || picked.el);
        mouseSelect(picked.el);
        await wait(500);
        setValue(field, desired);
        const hidden = form.querySelector('#hid_' + id);
        if (hidden && clean(hidden.value) !== desired) {
          hidden.value = desired;
          hidden.dispatchEvent(new Event('input', { bubbles: true }));
          hidden.dispatchEvent(new Event('change', { bubbles: true }));
          hidden.dispatchEvent(new Event('blur', { bubbles: true }));
        }
        field.dispatchEvent(new Event('blur', { bubbles: true }));
        return true;
      };

      const lastUsedOk = await selectDroope('lastUsedDroope', item.last_used);
      const yearOk = await selectDroope('expYearDroope', item.experience_years);
      const monthOk = await selectDroope('expMonthDroope', item.experience_months);
      if (!lastUsedOk || !yearOk || !monthOk) return { ok: false, error: 'dropdown_value_not_found', lastUsedOk, yearOk, monthOk };

      const save = Array.from(form.querySelectorAll('button,a,[role="button"],input[type="submit"]')).filter(visible)
        .find((el) => /^(save|update|submit|done)$/i.test(clean(el.innerText || el.value || el.textContent)));
      if (!save) return { ok: false, error: 'save_control_not_found' };
      save.click();
      await wait(2500);
      return { ok: true, status: row ? 'updated' : 'created' };
    })()
  `;
}

export function buildDeleteItSkillScript(skill, id = '') {
  return `
    (async () => {
      const skill = ${JSON.stringify(skill)};
      const targetId = ${JSON.stringify(id)};
      const clean = (value) => String(value || '').replace(/[\\u00a0\\u202f]+/g, ' ').replace(/\\s+/g, ' ').trim();
      const comparable = (value) => clean(value).toLowerCase().replace(/\\.js\\b/g, 'js').replace(/[^a-z0-9]+/g, '');
      const visible = (el) => {
        const rect = el && el.getBoundingClientRect ? el.getBoundingClientRect() : null;
        return !!rect && rect.width > 0 && rect.height > 0;
      };
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const section = document.getElementById('lazyITSkills');
      if (!section) return { ok: false, error: 'it_skills_section_not_found' };
      section.scrollIntoView({ block: 'center', inline: 'center' });
      await wait(400);
      const rows = Array.from(section.querySelectorAll('li.collection[data-prefillid]'));
      const row = rows.find((entry) => {
        if (targetId && entry.getAttribute('data-prefillid') === targetId) return true;
        const value = clean(entry.querySelector('span.col')?.innerText || entry.querySelector('span.col')?.textContent);
        return comparable(value) === comparable(skill);
      });
      if (!row) return { ok: true, status: 'not_found' };
      row.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      row.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      await wait(200);
      const control = row.querySelector('.delete, [class*="delete"], [class*="Delete"], [class*="trash"], [title*="Delete"], [aria-label*="Delete"], [title*="Remove"], [aria-label*="Remove"]')
        || Array.from(row.querySelectorAll('button,a,[role="button"],span,i,em,div')).reverse()
        .find((el) => /delete|remove|trash|close|cross|x/i.test(clean(el.innerText || el.textContent || el.getAttribute('aria-label') || el.getAttribute('title') || Array.from(el.classList || []).join(' '))));
      if (control) {
        control.click();
      } else {
        const edit = row.querySelector('.edit, [class*="edit"], [class*="Edit"], [title*="Edit"], [aria-label*="Edit"]')
          || Array.from(row.querySelectorAll('button,a,[role="button"],span,i,em,div'))
          .find((el) => /edit|pencil/i.test(clean(el.innerText || el.textContent || el.getAttribute('aria-label') || el.getAttribute('title') || Array.from(el.classList || []).join(' '))));
        if (!edit) return { ok: false, error: 'delete_control_not_found' };
        edit.click();
        await wait(900);
        const roots = Array.from(document.querySelectorAll('#itSkillsForm, [role="dialog"], .modal, [class*="modal"], [class*="Modal"], [class*="drawer"], [class*="Drawer"]')).filter(visible);
        const root = roots.at(-1) || document;
        const formDelete = Array.from(root.querySelectorAll('button,a,[role="button"],span,div')).filter(visible)
          .find((el) => /^delete$/i.test(clean(el.innerText || el.textContent || el.getAttribute('aria-label') || el.getAttribute('title'))) || /delete/i.test(Array.from(el.classList || []).join(' ')));
        if (!formDelete) return { ok: false, error: 'delete_control_not_found' };
        formDelete.click();
      }
      await wait(700);
      const confirm = Array.from(document.querySelectorAll('button,a,[role="button"],input[type="submit"]')).filter(visible)
        .find((el) => /^(delete|remove|yes|confirm|ok)$/i.test(clean(el.innerText || el.value || el.textContent)));
      if (confirm) {
        confirm.click();
        await wait(1200);
      }
      return { ok: true, status: 'deleted' };
    })()
  `;
}

export function compareSkillLists(expected, actual) {
  const expectedSkills = normalizeSkillList(expected);
  const actualSkills = normalizeSkillList(actual);
  const key = (value) => normalizeWhitespace(value).toLowerCase();
  const actualKeys = new Set(actualSkills.map(key));
  const expectedKeys = new Set(expectedSkills.map(key));
  return {
    missing: expectedSkills.filter((skill) => !actualKeys.has(key(skill))),
    extra: actualSkills.filter((skill) => !expectedKeys.has(key(skill))),
  };
}

export function buildSetKeySkillsScript(skills) {
  return `
    (async () => {
      const desiredSkills = ${JSON.stringify(skills)};
      const clean = (value) => String(value || '').replace(/[\\u00a0\\u202f]+/g, ' ').replace(/\\s+/g, ' ').trim();
      const comparable = (value) => clean(value).toLowerCase();
      const visible = (el) => {
        const rect = el && el.getBoundingClientRect ? el.getBoundingClientRect() : null;
        return !!rect && rect.width > 0 && rect.height > 0;
      };
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const section = document.getElementById('lazyKeySkills');
      if (!section) return { ok: false, error: 'key_skills_section_not_found' };
      const edit = section.querySelector('.widgetHead .edit.icon, .edit.icon, [class*="edit"]');
      if (!edit) return { ok: false, error: 'edit_control_not_found' };
      edit.scrollIntoView({ block: 'center', inline: 'center' });
      edit.click();
      await wait(1000);

      const roots = () => Array.from(document.querySelectorAll('[role="dialog"], .modal, [class*="modal"], [class*="Modal"], [class*="drawer"], [class*="Drawer"]')).filter(visible);
      const root = () => roots()[roots().length - 1] || document;
      const currentRoot = root();
      const fields = Array.from(currentRoot.querySelectorAll('input[type="text"],input:not([type]),textarea,[contenteditable="true"]')).filter(visible);
      const field = fields.find((el) => /skill/i.test(clean(el.getAttribute('placeholder') || el.getAttribute('name') || el.id || el.getAttribute('aria-label')))) || fields[0];
      if (!field) return { ok: false, error: 'skill_input_not_found' };

      const setValue = (el, value) => {
        el.focus();
        if (el.isContentEditable) {
          el.textContent = value;
          el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
          return;
        }
        const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
        descriptor.set.call(el, value);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: value.slice(-1) || 'a' }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      };

      const selectedSkillTexts = () => Array.from(root().querySelectorAll('.chip, [class*="chip"], [class*="tag"], [class*="Tag"], [class*="pill"], [class*="Pill"]'))
        .filter(visible)
        .map((el) => clean(el.getAttribute('title') || el.innerText || el.textContent))
        .filter((text) => text && !/editOneTheme|Add|Save|Cancel/i.test(text));

      setValue(field, '');
      for (let i = 0; i < 50; i++) {
        field.focus();
        field.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Backspace', code: 'Backspace', keyCode: 8, which: 8 }));
        field.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Backspace', code: 'Backspace', keyCode: 8, which: 8 }));
        await wait(80);
      }

      for (let pass = 0; pass < 6; pass++) {
        const currentSkills = selectedSkillTexts();
        if (!currentSkills.length) break;
        let removed = false;
        for (const container of Array.from(root().querySelectorAll('.chip, [class*="chip"], [class*="tag"], [class*="Tag"], [class*="pill"], [class*="Pill"]')).filter(visible)) {
          const text = clean(container.getAttribute('title') || container.innerText || container.textContent);
          if (!text || /editOneTheme|Add|Save|Cancel/i.test(text)) continue;
          const control = Array.from(container.querySelectorAll('button,a,span,i,em,[role="button"]')).reverse()
            .find((el) => /close|cross|delete|remove|cancel|×|x/i.test(clean(el.innerText || el.textContent || el.getAttribute('aria-label') || el.getAttribute('title') || Array.from(el.classList || []).join(' '))));
          if (control) {
            control.click();
          } else {
            container.click();
          }
          removed = true;
          await wait(250);
          break;
        }
        if (!removed) break;
      }

      const added = [];
      const failures = [];
      for (const skill of desiredSkills) {
        setValue(field, skill);
        await wait(900);
        const options = Array.from(document.querySelectorAll('[role="option"], [class*="suggest"] li, [class*="Suggest"] li, [class*="autocomplete"] li, [class*="Autocomplete"] li, .dropdown-content li, ul li'))
          .filter(visible)
          .map((el) => ({ el, text: clean(el.innerText || el.textContent) }))
          .filter((item) => item.text && item.text.length <= 120 && !/jobs|recommended jobs|application status|saved jobs|editOneTheme/i.test(item.text));
        const exact = options.find((item) => comparable(item.text) === comparable(skill));
        const fallback = options.find((item) => comparable(item.text).includes(comparable(skill)) || comparable(skill).includes(comparable(item.text)));
        const choice = exact || fallback;
        if (!choice) {
          failures.push({ skill, error: 'suggestion_not_found' });
          continue;
        }
        choice.el.click();
        added.push(choice.text);
        await wait(500);
      }

      const buttons = Array.from(root().querySelectorAll('button,a,[role="button"],input[type="submit"]')).filter(visible);
      const save = buttons.find((el) => /^(save|update|submit|done)$/i.test(clean(el.innerText || el.value || el.textContent)));
      if (!save) return { ok: false, error: 'save_control_not_found', added, failures };
      save.click();
      await wait(2500);
      return { ok: failures.length === 0, added, failures };
    })()
  `;
}

export async function setTextSection(page, sectionLabel, text, readColumn) {
  await ensureProfilePage(page);
  const opened = await page.evaluate(buildOpenTextSectionEditorScript(sectionLabel, text));
  if (!opened?.ok) {
    throw new CommandExecutionError(`Could not open Naukri ${sectionLabel} editor: ${opened?.error || 'unknown'}`);
  }
  await page.wait(2);
  const filled = await page.evaluate(buildFillActiveDialogTextScript(text));
  if (!filled?.ok) {
    throw new CommandExecutionError(`Could not fill Naukri ${sectionLabel} editor: ${filled?.error || filled?.actual || 'unknown'}`);
  }
  const saved = await page.evaluate(buildSaveActiveDialogScript());
  if (!saved?.ok) {
    throw new CommandExecutionError(`Could not save Naukri ${sectionLabel}: ${saved?.error || 'unknown'}`);
  }
  await page.wait(4);
  if (typeof page.scroll === 'function') {
    for (let i = 0; i < 8; i++) {
      await page.scroll('down', 900);
      await page.wait(0.4);
    }
  }
  if (typeof page.autoScroll === 'function') await page.autoScroll({ times: 12, delayMs: 500 });
  const row = await readProfile(page);
  const actual = normalizeWhitespace(row[readColumn]);
  const expected = normalizeWhitespace(text);
  if (actual !== expected) {
    throw new CommandExecutionError(`Naukri ${sectionLabel} did not match after save`, `Expected "${expected}", got "${actual}"`);
  }
  return { row, actual };
}
