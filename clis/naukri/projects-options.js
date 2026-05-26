import { cli, Strategy } from '@jackwener/opencli/registry';
import { ArgumentError, CommandExecutionError } from '@jackwener/opencli/errors';
import { ensureProfilePage, normalizeWhitespace } from './shared.js';

function parseLimit(value) {
  const limit = Number.parseInt(String(value ?? '20'), 10);
  if (!Number.isFinite(limit) || limit < 1 || limit > 50) {
    throw new ArgumentError('--limit must be between 1 and 50');
  }
  return limit;
}

function buildProjectOptionsScript({ matchTitle, skillQuery, limit }) {
  return `
    (async () => {
      const matchTitle = ${JSON.stringify(matchTitle)};
      const skillQuery = ${JSON.stringify(skillQuery)};
      const limit = ${Number(limit) || 20};
      const clean = (value) => String(value || '').replace(/[\\u00a0\\u202f]+/g, ' ').replace(/\\s+/g, ' ').trim();
      const comparable = (value) => clean(value).toLowerCase().replace(/\\.js\\b/g, 'js').replace(/[^a-z0-9]+/g, '');
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
      const section = document.getElementById('lazyProject') || document.getElementById('lazyProjects') || Array.from(document.querySelectorAll('[id]')).find((el) => /project/i.test(el.id));
      if (!section) return { ok: false, error: 'projects_section_not_found' };
      section.scrollIntoView({ block: 'center', inline: 'center' });
      await wait(500);
      if (matchTitle) {
        const rows = Array.from(section.querySelectorAll('li.collection[data-prefillid], li.collection, [data-prefillid], .project, div')).filter(visible)
          .filter((el) => /editOneTheme/i.test(clean(el.innerText || el.textContent)))
          .sort((a, b) => clean(a.innerText || a.textContent).length - clean(b.innerText || b.textContent).length);
        const row = rows.find((el) => comparable((clean(el.innerText || el.textContent).split('editOneTheme')[0] || '')) === comparable(matchTitle))
          || rows.find((el) => clean(el.innerText || el.textContent).toLowerCase().startsWith(clean(matchTitle).toLowerCase() + 'editonetheme'));
        if (!row) return { ok: false, error: 'project_not_found' };
        row.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
        row.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
        await wait(250);
        const edit = row.querySelector('.edit, [class*="edit"], [class*="Edit"], [title*="Edit"], [aria-label*="Edit"]')
          || Array.from(row.querySelectorAll('button,a,[role="button"],span,i,em,div')).find((el) => /edit|pencil/i.test(clean(el.innerText || el.textContent || el.getAttribute('aria-label') || el.getAttribute('title') || Array.from(el.classList || []).join(' '))));
        if (!edit) return { ok: false, error: 'edit_control_not_found' };
        mouseSelect(edit);
      } else {
        const add = Array.from(section.querySelectorAll('button,a,[role="button"],span,div')).filter(visible)
          .find((el) => /^add project$|^add$/i.test(clean(el.innerText || el.textContent)) || /add/i.test(clean(el.className || el.getAttribute('title'))));
        if (!add) return { ok: false, error: 'add_project_control_not_found' };
        mouseSelect(add);
      }
      await wait(1000);
      let form = document.getElementById('projectDetailsForm');
      if (!form) return { ok: false, error: 'project_form_not_found' };
      const addMore = Array.from(form.querySelectorAll('button,a,[role="button"],span,div')).filter(visible)
        .find((el) => /^add more details$/i.test(clean(el.innerText || el.textContent)));
      if (addMore) {
        mouseSelect(addMore);
        await wait(800);
        form = document.getElementById('projectDetailsForm') || form;
      }
      const readDropdown = async (id) => {
        const root = form.querySelector('#' + id) || document.querySelector('#' + id);
        const input = form.querySelector('#' + id + 'For') || document.querySelector('#' + id + 'For');
        const hidden = form.querySelector('#hid_' + id) || document.querySelector('#hid_' + id);
        if (input) {
          mouseSelect(input);
          await wait(250);
        }
        const optionRoot = form.querySelector('#ul_' + id) || form.querySelector('#dp_' + id) || document.querySelector('#ul_' + id) || document.querySelector('#dp_' + id) || root;
        const options = Array.from((optionRoot || form).querySelectorAll('a, [role="option"], li'))
          .map((el) => ({ value: clean(el.getAttribute('data-id') || el.id || ''), label: clean(el.innerText || el.textContent) }))
          .filter((option) => option.label && !/DownArrow/i.test(option.label))
          .sort((a, b) => Number(Boolean(b.value)) - Number(Boolean(a.value)));
        const seen = new Set();
        return {
          id,
          current: clean(input?.value || hidden?.value || ''),
          hidden: clean(hidden?.value || ''),
          options: options.filter((option) => {
            const key = (option.value + '|' + option.label).toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          }).slice(0, limit),
        };
      };
      const dropdownIds = Array.from(form.querySelectorAll('input[id$="For"]'))
        .map((input) => input.id.replace(/For$/, ''))
        .filter((id) => form.querySelector('#' + id) || form.querySelector('#hid_' + id));
      const dropdowns = [];
      for (const id of dropdownIds) {
        dropdowns.push(await readDropdown(id));
      }
      const fields = Array.from(form.querySelectorAll('input,textarea,[contenteditable="true"]'))
        .map((el) => ({
          id: clean(el.id),
          name: clean(el.getAttribute('name')),
          placeholder: clean(el.getAttribute('placeholder')),
          value: clean(el.value || el.textContent),
          type: clean(el.getAttribute('type') || el.tagName.toLowerCase()),
        }))
        .filter((field) => field.id || field.name || field.placeholder);
      const choices = Array.from(form.querySelectorAll('input[type="radio"], input[type="checkbox"]'))
        .map((el) => {
          const label = form.querySelector('label[for="' + el.id + '"]');
          return {
            id: clean(el.id),
            name: clean(el.name),
            value: clean(el.value),
            label: clean(label?.innerText || label?.textContent || el.getAttribute('aria-label') || el.id),
            checked: !!el.checked,
            type: clean(el.type),
          };
        })
        .filter((choice) => choice.id || choice.name || choice.label);
      let skillSuggestions = [];
      if (skillQuery) {
        const skillField = Array.from(form.querySelectorAll('input[type="text"],input:not([type])')).filter(visible)
          .find((el) => /skill|technology|software/i.test(clean(el.placeholder || el.name || el.id)));
        if (skillField) {
          skillField.focus();
          const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
          descriptor.set.call(skillField, skillQuery);
          skillField.dispatchEvent(new Event('input', { bubbles: true }));
          skillField.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: skillQuery.slice(-1) || 'a' }));
          skillField.dispatchEvent(new Event('change', { bubbles: true }));
          await wait(1200);
          const addUnique = (text) => {
            const value = clean(text);
            if (!value || value.length > 120) return;
            if (!value.toLowerCase().includes(skillQuery.toLowerCase())) return;
            if (/jobs|recommended jobs|application status|saved jobs|editOneTheme/i.test(value)) return;
            if (!skillSuggestions.some((item) => item.toLowerCase() === value.toLowerCase())) skillSuggestions.push(value);
          };
          for (const el of Array.from(document.querySelectorAll('[role="option"], [class*="suggest"] li, [class*="Suggest"] li, [class*="autocomplete"] li, [class*="Autocomplete"] li, .dropdown-content li, ul li')).filter(visible)) {
            addUnique(el.innerText || el.textContent);
          }
        }
      }
      const cancel = Array.from(form.querySelectorAll('button,a,[role="button"],span')).filter(visible)
        .find((el) => /^(cancel|close|crosslayer|×|x)$/i.test(clean(el.innerText || el.textContent || el.getAttribute('aria-label'))));
      if (cancel) mouseSelect(cancel);
      return { ok: true, dropdowns, fields, choices, skillSuggestions: skillSuggestions.slice(0, limit) };
    })()
  `;
}

cli({
  site: 'naukri',
  name: 'projects-options',
  access: 'read',
  description: 'Inspect live Naukri project modal dropdown options and skill suggestions without saving',
  domain: 'www.naukri.com',
  strategy: Strategy.COOKIE,
  browser: true,
  navigateBefore: false,
  args: [
    { name: 'match-title', type: 'str', help: 'Existing project title to inspect; opens add modal when omitted' },
    { name: 'skill-query', type: 'str', help: 'Optional project-skill query to resolve against live suggestions' },
    { name: 'limit', type: 'int', default: 20, help: 'Max options per dropdown or suggestions to return (1-50)' },
  ],
  columns: ['kind', 'id', 'current', 'value', 'label'],
  func: async (page, kwargs) => {
    if (!page) throw new CommandExecutionError('Browser session required for naukri projects-options');
    const limit = parseLimit(kwargs.limit);
    await ensureProfilePage(page);
    const result = await page.evaluate(buildProjectOptionsScript({
      matchTitle: normalizeWhitespace(kwargs['match-title']),
      skillQuery: normalizeWhitespace(kwargs['skill-query']),
      limit,
    }));
    if (!result?.ok) {
      throw new CommandExecutionError(`Could not inspect Naukri project options: ${result?.error || 'project_options_failed'}`);
    }
    const rows = [];
    for (const dropdown of result.dropdowns || []) {
      if (!dropdown.options?.length) {
        rows.push({ kind: 'dropdown', id: dropdown.id, current: dropdown.current || dropdown.hidden || '', value: '', label: '' });
        continue;
      }
      for (const option of dropdown.options) {
        rows.push({ kind: 'dropdown', id: dropdown.id, current: dropdown.current || dropdown.hidden || '', value: option.value || '', label: option.label || '' });
      }
    }
    for (const choice of result.choices || []) {
      rows.push({ kind: choice.type || 'choice', id: choice.name || choice.id, current: choice.checked ? 'selected' : '', value: choice.value || choice.id || '', label: choice.label || '' });
    }
    for (const field of result.fields || []) {
      rows.push({ kind: 'field', id: field.id || field.name || '', current: field.value || '', value: field.type || '', label: field.placeholder || field.name || '' });
    }
    for (const suggestion of result.skillSuggestions || []) {
      rows.push({ kind: 'skill-suggestion', id: 'skills', current: '', value: suggestion, label: suggestion });
    }
    return rows;
  },
});

export const __test__ = {
  parseLimit,
};
