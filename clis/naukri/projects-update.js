import { cli, Strategy } from '@jackwener/opencli/registry';
import { ArgumentError, CommandExecutionError } from '@jackwener/opencli/errors';
import { ensureProfilePage, normalizeSkillList, normalizeWhitespace, requireText } from './shared.js';
import { readProjects } from './projects-list.js';

function parseNature(value) {
  const nature = normalizeWhitespace(value).toLowerCase().replace(/[\s_-]+/g, '');
  if (!nature) return '';
  if (nature === 'fulltime') return 'fullTime';
  if (nature === 'parttime') return 'partTime';
  if (nature === 'contractual' || nature === 'contract') return 'contractual';
  throw new ArgumentError('--nature must be full-time, part-time, or contractual');
}

function parseLocationMode(value) {
  const mode = normalizeWhitespace(value).toLowerCase().replace(/[\s_-]+/g, '');
  if (!mode) return '';
  if (mode === 'offsite' || mode === 'remote') return 'offsite';
  if (mode === 'onsite') return 'onsite';
  throw new ArgumentError('--location-mode must be offsite, onsite, or remote');
}

function buildUpdateProjectScript(update) {
  return `
    (async () => {
      const update = ${JSON.stringify(update)};
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
      const setValue = (el, value) => {
        if (!el) return false;
        el.focus();
        const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
        descriptor.set.call(el, value == null ? '' : String(value));
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: String(value || '').slice(-1) || 'a' }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('blur', { bubbles: true }));
        return true;
      };
      const section = document.getElementById('lazyProject') || document.getElementById('lazyProjects') || Array.from(document.querySelectorAll('[id]')).find((el) => /project/i.test(el.id));
      if (!section) return { ok: false, error: 'projects_section_not_found' };
      section.scrollIntoView({ block: 'center', inline: 'center' });
      await wait(500);
      const rows = Array.from(section.querySelectorAll('li.collection[data-prefillid], li.collection, [data-prefillid], .project, div')).filter(visible)
        .filter((el) => /editOneTheme/i.test(clean(el.innerText || el.textContent)))
        .sort((a, b) => clean(a.innerText || a.textContent).length - clean(b.innerText || b.textContent).length);
      const row = rows.find((el) => comparable((clean(el.innerText || el.textContent).split('editOneTheme')[0] || '')) === comparable(update.match_title))
        || rows.find((el) => clean(el.innerText || el.textContent).toLowerCase().startsWith(clean(update.match_title).toLowerCase() + 'editonetheme'));
      if (!row) return { ok: false, error: 'project_not_found' };
      row.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      row.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      await wait(250);
      const edit = row.querySelector('.edit, [class*="edit"], [class*="Edit"], [title*="Edit"], [aria-label*="Edit"]')
        || Array.from(row.querySelectorAll('button,a,[role="button"],span,i,em,div')).find((el) => /edit|pencil/i.test(clean(el.innerText || el.textContent || el.getAttribute('aria-label') || el.getAttribute('title') || Array.from(el.classList || []).join(' '))));
      if (!edit) return { ok: false, error: 'edit_control_not_found' };
      mouseSelect(edit);
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

      const selectDropdown = async (id, label) => {
        const desired = clean(label);
        if (!desired) return { ok: true, selected: '' };
        const root = form.querySelector('#' + id) || document.querySelector('#' + id);
        const input = form.querySelector('#' + id + 'For') || document.querySelector('#' + id + 'For');
        const hidden = form.querySelector('#hid_' + id) || document.querySelector('#hid_' + id);
        if (!input || !hidden) return { ok: false, error: id + '_field_not_found' };
        mouseSelect(input);
        await wait(300);
        const optionRoot = form.querySelector('#ul_' + id) || form.querySelector('#dp_' + id) || document.querySelector('#ul_' + id) || document.querySelector('#dp_' + id) || root || form;
        const options = Array.from(optionRoot.querySelectorAll('a, [role="option"], li'))
          .map((el) => ({ el, label: clean(el.innerText || el.textContent), value: clean(el.getAttribute('data-id') || el.id || '') }))
          .filter((option) => option.label && !/DownArrow/i.test(option.label))
          .sort((a, b) => Number(Boolean(b.value)) - Number(Boolean(a.value)));
        const picked = options.find((option) => comparable(option.label) === comparable(desired) || comparable(option.value) === comparable(desired))
          || options.find((option) => comparable(option.label).includes(comparable(desired)) || comparable(desired).includes(comparable(option.label)));
        if (!picked) return { ok: false, error: id + '_option_not_found', available: options.map((option) => option.label).slice(0, 20) };
        mouseSelect(picked.el.closest('li') || picked.el);
        mouseSelect(picked.el);
        await wait(400);
        setValue(input, picked.label);
        if (hidden) {
          const idValue = picked.value && picked.value.includes('_') ? picked.value.split('_').slice(1).join('_') : picked.value || picked.label;
          hidden.value = idValue;
          hidden.dispatchEvent(new Event('input', { bubbles: true }));
          hidden.dispatchEvent(new Event('change', { bubbles: true }));
        }
        return { ok: true, selected: picked.label };
      };

      const selectRadio = (id) => {
        if (!id) return true;
        const radio = form.querySelector('#' + id);
        if (!radio) return false;
        mouseSelect(radio);
        radio.checked = true;
        radio.dispatchEvent(new Event('input', { bubbles: true }));
        radio.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      };

      const selected = {};
      if (update.tag) {
        const result = await selectDropdown('eduExpId', update.tag);
        if (!result.ok) return { ok: false, error: result.error, available: result.available };
        selected.tag = result.selected;
      }
      if (update.location_mode && !selectRadio(update.location_mode)) return { ok: false, error: 'location_mode_not_found' };
      if (update.location) setValue(form.querySelector('#projectLocation'), update.location);
      if (update.nature && !selectRadio(update.nature)) return { ok: false, error: 'nature_not_found' };
      if (update.details) setValue(form.querySelector('#projectDetails'), update.details);
      if (update.team_size) {
        const result = await selectDropdown('teamSize', update.team_size);
        if (!result.ok) return { ok: false, error: result.error, available: result.available };
        selected.team_size = result.selected;
      }
      if (update.role) {
        const result = await selectDropdown('role', update.role);
        if (!result.ok) return { ok: false, error: result.error, available: result.available };
        selected.role = result.selected;
      }
      if (update.role_description) setValue(form.querySelector('#roleDesc'), update.role_description);

      const skillsField = form.querySelector('#skillsUsed');
      const selectedSkillTexts = () => Array.from(form.querySelectorAll('.chip, [class*="chip"], [class*="tag"], [class*="Tag"], [class*="pill"], [class*="Pill"]')).filter(visible)
        .map((el) => clean(el.getAttribute('title') || el.innerText || el.textContent))
        .filter((text) => text && !/editOneTheme|Add|Save|Cancel/i.test(text));
      const addedSkills = [];
      const skillFailures = [];
      if (skillsField && update.skills.length) {
        for (const skill of update.skills) {
          setValue(skillsField, skill);
          await wait(900);
          const options = Array.from(document.querySelectorAll('[role="option"], [class*="suggest"] li, [class*="Suggest"] li, [class*="autocomplete"] li, [class*="Autocomplete"] li, .dropdown-content li, ul li')).filter(visible)
            .map((el) => ({ el, text: clean(el.innerText || el.textContent) }))
            .filter((option) => option.text && option.text.length <= 120 && !/jobs|recommended jobs|application status|saved jobs|editOneTheme/i.test(option.text));
          const choice = options.find((option) => comparable(option.text) === comparable(skill))
            || options.find((option) => comparable(option.text).includes(comparable(skill)) || comparable(skill).includes(comparable(option.text)));
          if (!choice) {
            addedSkills.push(skill);
            skillFailures.push({ skill, error: 'suggestion_not_found_used_input' });
            continue;
          }
          addedSkills.push(choice.text);
        }
        setValue(skillsField, addedSkills.join(', '));
        await wait(400);
      }
      const save = form.querySelector('#submitProject') || Array.from(form.querySelectorAll('button,a,[role="button"],input[type="submit"]')).filter(visible)
        .find((el) => /^save$/i.test(clean(el.innerText || el.value || el.textContent)));
      if (!save) return { ok: false, error: 'project_save_not_found', addedSkills, selected };
      mouseSelect(save);
      await wait(5000);
      if (document.getElementById('projectDetailsForm')) {
        const errors = Array.from(document.querySelectorAll('#projectDetailsForm .erLbl')).map((el) => clean(el.innerText || el.textContent)).filter(Boolean);
        return { ok: false, error: 'project_save_validation_failed', errors, addedSkills, selected };
      }
      return { ok: true, addedSkills, selected };
    })()
  `;
}

cli({
  site: 'naukri',
  name: 'projects-update',
  access: 'write',
  description: 'Update optional Naukri project fields using live dropdown and autocomplete resolution',
  domain: 'www.naukri.com',
  strategy: Strategy.COOKIE,
  browser: true,
  navigateBefore: false,
  args: [
    { name: 'match-title', type: 'str', required: true, help: 'Existing project title to update' },
    { name: 'tag', type: 'str', help: 'Employment or education label to tag, resolved against live dropdown options' },
    { name: 'location', type: 'str', help: 'Project location text' },
    { name: 'location-mode', type: 'str', help: 'offsite, onsite, or remote' },
    { name: 'nature', type: 'str', help: 'full-time, part-time, or contractual' },
    { name: 'team-size', type: 'str', help: 'Team size option label' },
    { name: 'role', type: 'str', help: 'Role label, resolved against live role dropdown options' },
    { name: 'role-description', type: 'str', help: 'Role description text' },
    { name: 'details', type: 'str', help: 'Project details text' },
    { name: 'skills', type: 'str', help: 'Comma-separated skills to resolve against project skill autocomplete' },
  ],
  columns: ['status', 'title', 'role', 'skills'],
  func: async (page, kwargs) => {
    if (!page) throw new CommandExecutionError('Browser session required for naukri projects-update');
    const matchTitle = requireText(kwargs['match-title'], 'match-title', 100);
    const update = {
      match_title: matchTitle,
      tag: normalizeWhitespace(kwargs.tag),
      location: normalizeWhitespace(kwargs.location),
      location_mode: parseLocationMode(kwargs['location-mode']),
      nature: parseNature(kwargs.nature),
      team_size: normalizeWhitespace(kwargs['team-size']),
      role: normalizeWhitespace(kwargs.role),
      role_description: kwargs['role-description'] ? requireText(kwargs['role-description'], 'role-description', 1000) : '',
      details: kwargs.details ? requireText(kwargs.details, 'details', 1000) : '',
      skills: normalizeSkillList(kwargs.skills),
    };
    await ensureProfilePage(page);
    const before = await readProjects(page);
    if (!before.some((row) => row.title.toLowerCase() === matchTitle.toLowerCase() || row.text.toLowerCase().includes(matchTitle.toLowerCase()))) {
      throw new CommandExecutionError('Naukri project was not found before update', matchTitle);
    }
    const result = await page.evaluate(buildUpdateProjectScript(update));
    if (!result?.ok) {
      throw new CommandExecutionError(`Could not update Naukri project: ${result?.error || 'project_update_failed'}`, JSON.stringify(result || {}, null, 2));
    }
    await page.wait(4);
    const after = await readProjects(page);
    const exists = after.some((row) => row.title.toLowerCase() === matchTitle.toLowerCase() || row.text.toLowerCase().includes(matchTitle.toLowerCase()));
    if (!exists) throw new CommandExecutionError('Naukri project was not visible after update', matchTitle);
    return [{
      status: 'updated',
      title: matchTitle,
      role: result.selected?.role || '',
      skills: (result.addedSkills || []).join(', '),
    }];
  },
});

export const __test__ = {
  parseLocationMode,
  parseNature,
};
