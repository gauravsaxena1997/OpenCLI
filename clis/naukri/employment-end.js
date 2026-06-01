import { cli, Strategy } from '@jackwener/opencli/registry';
import { ArgumentError, CommandExecutionError } from '@jackwener/opencli/errors';
import { ensureProfilePage, normalizeWhitespace, requireText, readProfile } from './shared.js';
import { readEmploymentRows } from './employment-list.js';

function parseYear(value) {
  const year = normalizeWhitespace(value);
  if (!/^\d{4}$/.test(year)) throw new ArgumentError('--end-year must be a 4 digit year');
  return year;
}

function parseMonth(value) {
  const months = {
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
  const key = normalizeWhitespace(value).toLowerCase();
  const month = months[key] || key;
  if (!/^(?:[1-9]|1[0-2])$/.test(month)) throw new ArgumentError('--end-month must be 1-12 or a month name');
  return month;
}

function buildEndEmploymentScript(company, endYear, endMonth) {
  return `
    (async () => {
      const company = ${JSON.stringify(company)};
      const endYear = ${JSON.stringify(endYear)};
      const endMonth = ${JSON.stringify(endMonth)};
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

      const rows = Array.from(document.querySelectorAll('.emp-list'));
      const row = rows.find((entry) => clean(entry.innerText || entry.textContent).toLowerCase().includes(company.toLowerCase()));
      if (!row) return { ok: false, error: 'employment_row_not_found' };
      row.scrollIntoView({ block: 'center', inline: 'center' });
      await wait(400);
      const edit = row.querySelector('.edit, [class*="edit"], [title*="Edit"], [aria-label*="Edit"]')
        || Array.from(row.querySelectorAll('button,a,[role="button"],span,i,em,div')).filter(visible)
          .find((el) => /edit|pencil/i.test(clean(el.innerText || el.textContent || el.getAttribute('title') || el.getAttribute('aria-label') || Array.from(el.classList || []).join(' '))));
      if (!edit) return { ok: false, error: 'employment_edit_not_found' };
      edit.click();
      await wait(1200);
      const form = document.getElementById('employmentForm');
      if (!form) return { ok: false, error: 'employment_form_not_found' };
      const no = form.querySelector('#no');
      if (!no) return { ok: false, error: 'current_employment_no_not_found' };
      no.click();
      no.checked = true;
      no.dispatchEvent(new Event('input', { bubbles: true }));
      no.dispatchEvent(new Event('change', { bubbles: true }));
      await wait(1000);
      const yearOk = await setDropdown('workedTillYear', endYear);
      const monthOk = await setDropdown('workedTillMonth', endMonth);
      if (!yearOk || !monthOk) return { ok: false, error: 'worked_till_select_failed', yearOk, monthOk };
      const save = form.querySelector('#submitEmployment') || Array.from(form.querySelectorAll('button,a,[role="button"]')).filter(visible)
        .find((el) => /^save$/i.test(clean(el.innerText || el.textContent)));
      if (!save) return { ok: false, error: 'employment_save_not_found' };
      save.click();
      await wait(3500);
      return { ok: true };
    })()
  `;
}

cli({
  site: 'naukri',
  name: 'employment-end',
  access: 'write',
  description: 'Mark a Naukri employment entry as previous employment with a worked-till month/year',
  domain: 'www.naukri.com',
  strategy: Strategy.COOKIE,
  browser: true,
  navigateBefore: false,
  args: [
    { name: 'company', type: 'str', required: true, help: 'Company name substring to update' },
    { name: 'end-year', type: 'str', required: true, help: 'Worked till year' },
    { name: 'end-month', type: 'str', required: true, help: 'Worked till month number or name' },
  ],
  columns: ['status', 'company', 'worked_till'],
  func: async (page, kwargs) => {
    if (!page) throw new CommandExecutionError('Browser session required for naukri employment-end');
    const company = requireText(kwargs.company, 'company', 100);
    const endYear = parseYear(kwargs['end-year']);
    const endMonth = parseMonth(kwargs['end-month']);
    await ensureProfilePage(page);
    const result = await page.evaluate(buildEndEmploymentScript(company, endYear, endMonth));
    if (!result?.ok) {
      throw new CommandExecutionError(`Could not update Naukri employment: ${result?.error || 'employment_end_failed'}`, JSON.stringify(result || {}, null, 2));
    }
    await page.wait(5);
    const profile = await readProfile(page);
    const employment = normalizeWhitespace(profile.employment);
    if (/Zetwerk Manufacturing.+Present/i.test(employment)) {
      throw new CommandExecutionError('Naukri employment still shows Zetwerk as Present after save', employment);
    }
    if (!/Zetwerk Manufacturing.+Feb 2025/i.test(employment)) {
      throw new CommandExecutionError('Naukri employment did not show the expected worked-till date after save', employment);
    }
    return [{ status: 'updated', company, worked_till: `${endYear}-${endMonth.padStart(2, '0')}` }];
  },
});

export const __test__ = {
  parseMonth,
  parseYear,
};
