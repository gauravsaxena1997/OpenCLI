import { cli, Strategy } from '@jackwener/opencli/registry';
import { ArgumentError, CommandExecutionError } from '@jackwener/opencli/errors';
import { ensureProfilePage, normalizeWhitespace, requireText } from './shared.js';
import { readProjects } from './projects-list.js';

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

function parseStatus(value) {
  const status = normalizeWhitespace(value).toLowerCase();
  if (status === 'finished' || status === 'inprogress' || status === 'in progress') return status === 'finished' ? 'finished' : 'inprogress';
  throw new ArgumentError('--status must be "finished" or "in progress"');
}

function parseYear(value, fieldName = '--start-year') {
  const year = normalizeWhitespace(value);
  if (!/^\d{4}$/.test(year)) throw new ArgumentError(`${fieldName} must be a 4 digit year`);
  return year;
}

function parseMonth(value, fieldName = '--start-month') {
  const key = normalizeWhitespace(value).toLowerCase();
  const month = MONTHS[key] || key;
  if (!/^(?:[1-9]|1[0-2])$/.test(month)) throw new ArgumentError(`${fieldName} must be 1-12 or a month name`);
  return month;
}

function buildAddProjectScript(project) {
  return `
    (async () => {
      const project = ${JSON.stringify(project)};
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
      const section = document.getElementById('lazyProject') || document.getElementById('lazyProjects') || Array.from(document.querySelectorAll('[id]')).find((el) => /project/i.test(el.id));
      if (!section) return { ok: false, error: 'projects_section_not_found' };
      section.scrollIntoView({ block: 'center', inline: 'center' });
      await wait(500);
      const add = Array.from(section.querySelectorAll('button,a,[role="button"],span,div')).filter(visible)
        .find((el) => /^add project$|^add$/i.test(clean(el.innerText || el.textContent)) || /add/i.test(clean(el.className || el.getAttribute('title'))));
      if (!add) return { ok: false, error: 'add_project_control_not_found' };
      mouseSelect(add);
      await wait(1000);
      const form = document.getElementById('projectDetailsForm');
      if (!form) return { ok: false, error: 'project_form_not_found' };
      setValue(form.querySelector('#projectTitle'), project.title);
      setValue(form.querySelector('#clientName'), project.client);
      const status = form.querySelector('#' + project.status);
      if (status) {
        status.click();
        status.checked = true;
        status.dispatchEvent(new Event('input', { bubbles: true }));
        status.dispatchEvent(new Event('change', { bubbles: true }));
      }
      const selectDroope = async (id, value) => {
        const currentForm = document.getElementById('projectDetailsForm') || form;
        const field = currentForm.querySelector('#' + id + 'For') || document.querySelector('#' + id + 'For');
        const hidden = currentForm.querySelector('#hid_' + id) || document.querySelector('#hid_' + id);
        const choice = currentForm.querySelector('[data-id="' + id + '_' + value + '"]') || document.querySelector('[data-id="' + id + '_' + value + '"]');
        if (!field || !hidden) return false;
        if (!choice) {
          field.value = value;
          hidden.value = value;
          field.dispatchEvent(new Event('input', { bubbles: true }));
          field.dispatchEvent(new Event('change', { bubbles: true }));
          field.dispatchEvent(new Event('blur', { bubbles: true }));
          hidden.dispatchEvent(new Event('input', { bubbles: true }));
          hidden.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
        field.click();
        await wait(150);
        mouseSelect(choice.closest('li') || choice);
        mouseSelect(choice);
        await wait(250);
        field.value = value;
        hidden.value = value;
        field.dispatchEvent(new Event('input', { bubbles: true }));
        field.dispatchEvent(new Event('change', { bubbles: true }));
        field.dispatchEvent(new Event('blur', { bubbles: true }));
        hidden.dispatchEvent(new Event('input', { bubbles: true }));
        hidden.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      };
      const yearOk = await selectDroope('projStartYear', project.start_year);
      const monthOk = await selectDroope('projStartMonth', project.start_month);
      if (!yearOk) return { ok: false, error: 'project_date_select_failed', yearOk, monthOk };
      if (project.status === 'finished') {
        const endYearOk = await selectDroope('projEndYear', project.end_year);
        const endMonthOk = await selectDroope('projEndMonth', project.end_month);
        if (!endYearOk || !endMonthOk) return { ok: false, error: 'project_end_date_select_failed', endYearOk, endMonthOk };
      }
      setValue(form.querySelector('#projectDetails'), project.details);
      const save = form.querySelector('#submitProject') || Array.from(form.querySelectorAll('button,a,[role="button"]')).filter(visible)
        .find((el) => /^save$/i.test(clean(el.innerText || el.textContent)));
      if (!save) return { ok: false, error: 'project_save_not_found' };
      mouseSelect(save);
      await wait(4500);
      const stillOpen = !!document.getElementById('projectDetailsForm');
      if (stillOpen) {
        const errors = Array.from(document.querySelectorAll('#projectDetailsForm .erLbl'))
          .map((el) => clean(el.innerText || el.textContent))
          .filter(Boolean);
        return { ok: false, error: 'project_save_validation_failed', errors };
      }
      return { ok: true };
    })()
  `;
}

cli({
  site: 'naukri',
  name: 'projects-add',
  access: 'write',
  description: 'Add a Naukri profile project with required deterministic fields',
  domain: 'www.naukri.com',
  strategy: Strategy.COOKIE,
  browser: true,
  navigateBefore: false,
  args: [
    { name: 'title', type: 'str', required: true, help: 'Project title' },
    { name: 'client', type: 'str', required: true, help: 'Client name' },
    { name: 'status', type: 'str', default: 'finished', help: 'finished or in progress' },
    { name: 'start-year', type: 'str', required: true, help: 'Start year' },
    { name: 'start-month', type: 'str', required: true, help: 'Start month number or name' },
    { name: 'end-year', type: 'str', help: 'End year for finished projects' },
    { name: 'end-month', type: 'str', help: 'End month number or name for finished projects' },
    { name: 'details', type: 'str', required: true, help: 'Project details text' },
  ],
  columns: ['status', 'title'],
  func: async (page, kwargs) => {
    if (!page) throw new CommandExecutionError('Browser session required for naukri projects-add');
    const project = {
      title: requireText(kwargs.title, 'title', 100),
      client: requireText(kwargs.client, 'client', 100),
      status: parseStatus(kwargs.status),
      start_year: parseYear(kwargs['start-year'], '--start-year'),
      start_month: parseMonth(kwargs['start-month'], '--start-month'),
      end_year: kwargs['end-year'] ? parseYear(kwargs['end-year'], '--end-year') : '',
      end_month: kwargs['end-month'] ? parseMonth(kwargs['end-month'], '--end-month') : '',
      details: requireText(kwargs.details, 'details', 1000),
    };
    if (project.status === 'finished' && (!project.end_year || !project.end_month)) {
      throw new ArgumentError('--end-year and --end-month are required when --status is "finished"');
    }
    await ensureProfilePage(page);
    const before = await readProjects(page);
    if (before.some((row) => row.text.toLowerCase().includes(project.title.toLowerCase()))) {
      return [{ status: 'exists', title: project.title }];
    }
    const result = await page.evaluate(buildAddProjectScript(project));
    if (!result?.ok) {
      throw new CommandExecutionError(`Could not add Naukri project: ${result?.error || 'project_add_failed'}`, JSON.stringify(result || {}, null, 2));
    }
    await page.wait(4);
    const after = await readProjects(page);
    const exists = after.some((row) => row.text.toLowerCase().includes(project.title.toLowerCase()));
    if (!exists) throw new CommandExecutionError('Naukri project was not visible after save', project.title);
    return [{ status: 'added', title: project.title }];
  },
});

export const __test__ = {
  parseMonth,
  parseStatus,
  parseYear,
};
