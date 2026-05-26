import { cli, Strategy } from '@jackwener/opencli/registry';
import { ArgumentError, CommandExecutionError } from '@jackwener/opencli/errors';
import { ensureProfilePage, normalizeSkillList, normalizeWhitespace, requireText } from './shared.js';
import { readEmploymentRows } from './employment-list.js';

const MONTHS = {
  jan: '1', january: '1',
  feb: '2', february: '2',
  mar: '3', march: '3',
  apr: '4', april: '4',
  may: '5',
  jun: '6', june: '6',
  jul: '7', july: '7',
  aug: '8', august: '8',
  sep: '9', september: '9',
  oct: '10', october: '10',
  nov: '11', november: '11',
  dec: '12', december: '12',
};

function parseYear(value, fieldName) {
  const year = normalizeWhitespace(value);
  if (!/^\d{4}$/.test(year)) throw new ArgumentError(`${fieldName} must be a 4 digit year`);
  return year;
}

function parseMonth(value, fieldName) {
  const key = normalizeWhitespace(value).toLowerCase();
  const month = MONTHS[key] || key;
  if (!/^(?:[1-9]|1[0-2])$/.test(month)) throw new ArgumentError(`${fieldName} must be 1-12 or a month name`);
  return month;
}

function buildAddCurrentEmploymentScript(row) {
  return `
    (async () => {
      const row = ${JSON.stringify(row)};
      const clean = (value) => String(value || '').replace(/[\\u00a0\\u202f]+/g, ' ').replace(/\\s+/g, ' ').trim();
      const visible = (el) => {
        const rect = el && el.getBoundingClientRect ? el.getBoundingClientRect() : null;
        return !!rect && rect.width > 0 && rect.height > 0;
      };
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const mouseSelect = (el) => {
        for (const type of ['pointerdown', 'mousedown', 'mouseup', 'click']) {
          el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
        }
      };
      const setValue = (el, value) => {
        if (!el) return false;
        el.focus();
        const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
        descriptor.set.call(el, value);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('blur', { bubbles: true }));
        return true;
      };
      const setDropdown = async (id, value) => {
        const form = document.getElementById('employmentForm') || document;
        const dropdown = form.querySelector('#' + id);
        const field = form.querySelector('#' + id + 'For') || dropdown?.querySelector('input[type="text"]');
        const hidden = form.querySelector('#hid_' + id);
        if (!field || !hidden) return false;
        field.click();
        await wait(200);
        const choice = (dropdown || form).querySelector('[data-id="' + id + '_' + value + '"]') || document.querySelector('[data-id="' + id + '_' + value + '"]');
        if (choice) {
          mouseSelect(choice.closest('li') || choice);
          mouseSelect(choice);
          await wait(250);
        }
        field.value = value;
        hidden.value = value;
        field.dispatchEvent(new Event('input', { bubbles: true }));
        field.dispatchEvent(new Event('change', { bubbles: true }));
        hidden.dispatchEvent(new Event('input', { bubbles: true }));
        hidden.dispatchEvent(new Event('change', { bubbles: true }));
        field.dispatchEvent(new Event('blur', { bubbles: true }));
        return true;
      };
      const rootText = clean(document.body?.innerText || '');
      if (rootText.toLowerCase().includes(row.company.toLowerCase()) && rootText.toLowerCase().includes(row.title.toLowerCase())) {
        return { ok: true, status: 'exists' };
      }
      const add = document.getElementById('add-employment')
        || Array.from(document.querySelectorAll('button,a,[role="button"],span,div')).filter(visible)
          .find((el) => /^add employment$/i.test(clean(el.innerText || el.textContent)))
        || Array.from(document.querySelectorAll('.widgetHead, .card, section, div')).filter(visible)
          .filter((el) => /^Employment\\b/i.test(clean(el.innerText || el.textContent)) || /Zetwerk|OnGraph/i.test(clean(el.innerText || el.textContent)))
          .flatMap((el) => Array.from(el.querySelectorAll('button,a,[role="button"],span,div')).filter(visible))
          .find((el) => /^add$/i.test(clean(el.innerText || el.textContent)) || /add/i.test(clean(el.id || el.className || el.getAttribute('title') || el.getAttribute('aria-label'))));
      if (!add) return { ok: false, error: 'add_employment_control_not_found' };
      add.scrollIntoView({ block: 'center', inline: 'center' });
      mouseSelect(add);
      await wait(1300);
      const form = document.getElementById('employmentForm');
      if (!form) return { ok: false, error: 'employment_form_not_found' };
      const yes = form.querySelector('#yes');
      if (!yes) return { ok: false, error: 'current_employment_yes_not_found' };
      yes.click();
      yes.checked = true;
      yes.dispatchEvent(new Event('input', { bubbles: true }));
      yes.dispatchEvent(new Event('change', { bubbles: true }));
      await wait(700);
      const fullTime = form.querySelector('#expType_Full-time_F');
      if (fullTime) {
        fullTime.click();
        fullTime.checked = true;
        fullTime.dispatchEvent(new Event('change', { bubbles: true }));
      }
      setValue(form.querySelector('#companySugg'), row.company);
      setValue(form.querySelector('#designationSugg'), row.title);
      await setDropdown('startedYear', row.start_year);
      await setDropdown('startedMonth', row.start_month);
      await setDropdown('exp-years-droope', row.total_years);
      await setDropdown('exp-months-droope', row.total_months);
      const salary = form.querySelector('#totalAbsCtc_id');
      if (salary && row.salary) setValue(salary, row.salary);
      const fixed = form.querySelector('[data-id="salaryBreakDownDD_1"]');
      if (fixed) {
        await setDropdown('salaryBreakDownDD', '1');
      }
      for (const chip of Array.from(form.querySelectorAll('.chipsContainer .chip .close, .chipsContainer .chip a')).reverse()) {
        chip.click();
        await wait(120);
      }
      const skillField = form.querySelector('#keySkillSugg');
      for (const skill of row.skills) {
        if (!skillField) break;
        setValue(skillField, skill);
        await wait(700);
        const options = Array.from(document.querySelectorAll('[role="option"], [class*="suggest"] li, [class*="Suggest"] li, .Sdrop li, ul li')).filter(visible)
          .map((el) => ({ el, text: clean(el.innerText || el.textContent) }))
          .filter((option) => option.text && option.text.length <= 120);
        const comparable = (value) => clean(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
        const choice = options.find((option) => comparable(option.text) === comparable(skill))
          || options.find((option) => comparable(option.text).includes(comparable(skill)) || comparable(skill).includes(comparable(option.text)));
        if (choice) {
          mouseSelect(choice.el.closest('li') || choice.el);
          mouseSelect(choice.el);
          await wait(350);
        }
      }
      setValue(form.querySelector('#jobDescription'), row.description);
      await setDropdown('noticePeriod', row.notice_period);
      const save = form.querySelector('#submitEmployment') || Array.from(form.querySelectorAll('button,a,[role="button"]')).filter(visible)
        .find((el) => /^save$/i.test(clean(el.innerText || el.textContent)));
      if (!save) return { ok: false, error: 'employment_save_not_found' };
      mouseSelect(save);
      await wait(4500);
      return { ok: true, status: 'created' };
    })()
  `;
}

cli({
  site: 'naukri',
  name: 'employment-add-current',
  access: 'write',
  description: 'Add a current Naukri employment entry and verify it appears in employment history',
  domain: 'www.naukri.com',
  strategy: Strategy.COOKIE,
  browser: true,
  navigateBefore: false,
  args: [
    { name: 'title', type: 'str', required: true, help: 'Current job title' },
    { name: 'company', type: 'str', required: true, help: 'Current company name' },
    { name: 'start-year', type: 'str', required: true, help: 'Joining year' },
    { name: 'start-month', type: 'str', required: true, help: 'Joining month number or name' },
    { name: 'total-years', type: 'int', default: 6, help: 'Total profile experience years' },
    { name: 'total-months', type: 'int', default: 6, help: 'Total profile experience months' },
    { name: 'salary', type: 'str', default: '25,00,000', help: 'Current salary amount without currency symbol' },
    { name: 'notice-period', type: 'str', default: '1', help: 'Naukri notice period id; 1 means 15 Days or less' },
    { name: 'skills', type: 'str', required: true, help: 'Comma-separated top skills used' },
    { name: 'description', type: 'str', required: true, help: 'Job profile description' },
  ],
  columns: ['status', 'title', 'company'],
  func: async (page, kwargs) => {
    if (!page) throw new CommandExecutionError('Browser session required for naukri employment-add-current');
    const row = {
      title: requireText(kwargs.title, 'title', 100),
      company: requireText(kwargs.company, 'company', 100),
      start_year: parseYear(kwargs['start-year'], '--start-year'),
      start_month: parseMonth(kwargs['start-month'], '--start-month'),
      total_years: String(kwargs['total-years'] ?? 6),
      total_months: String(kwargs['total-months'] ?? 6),
      salary: normalizeWhitespace(kwargs.salary),
      notice_period: normalizeWhitespace(kwargs['notice-period'] || '1'),
      skills: normalizeSkillList(kwargs.skills).slice(0, 5),
      description: requireText(kwargs.description, 'description', 4000),
    };
    if (!row.skills.length) throw new ArgumentError('--skills is required');
    await ensureProfilePage(page);
    const beforeRows = await readEmploymentRows(page);
    if (beforeRows.some((entry) => entry.company.toLowerCase() === row.company.toLowerCase() && entry.title.toLowerCase() === row.title.toLowerCase())) {
      return [{ status: 'exists', title: row.title, company: row.company }];
    }
    const result = await page.evaluate(buildAddCurrentEmploymentScript(row));
    if (!result?.ok) {
      throw new CommandExecutionError(`Could not add Naukri current employment: ${result?.error || 'employment_add_current_failed'}`, JSON.stringify(result || {}, null, 2));
    }
    await page.wait(5);
    const afterRows = await readEmploymentRows(page);
    const exists = afterRows.some((entry) => entry.company.toLowerCase() === row.company.toLowerCase() && entry.title.toLowerCase() === row.title.toLowerCase());
    if (!exists) throw new CommandExecutionError('Naukri current employment was not visible after save', `${row.title} at ${row.company}`);
    return [{ status: result.status || 'created', title: row.title, company: row.company }];
  },
});

export const __test__ = {
  parseMonth,
  parseYear,
};
