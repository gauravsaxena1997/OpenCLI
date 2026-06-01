import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { getRegistry } from '@jackwener/opencli/registry';
import { ArgumentError, CommandExecutionError } from '@jackwener/opencli/errors';
import { PROFILE_COLUMNS } from './shared.js';
import './profile-read.js';
import './employment-add-current.js';
import './employment-end.js';
import './employment-list.js';
import './it-skills-delete.js';
import './it-skills-list.js';
import './it-skills-resolve.js';
import './it-skills-set.js';
import './it-skills-upsert.js';
import './projects-add.js';
import './projects-list.js';
import './projects-options.js';
import './projects-update.js';
import './key-skills-list.js';
import './key-skills-resolve.js';
import './key-skills-set.js';
import './key-skills-suggest.js';
import './headline-set.js';
import './summary-set.js';
import './resume-upload.js';

const { compareItSkillRows, normalizeItSkillItem, normalizeItSkillRows, parseExperience, parseItSkillItems, requireText } = await import('./shared.js');
const { requireResumePath } = await import('./resume-upload.js').then((m) => m.__test__);
const { parseLimit } = await import('./key-skills-suggest.js').then((m) => m.__test__);
const { resolveSkill } = await import('./key-skills-resolve.js').then((m) => m.__test__);
const { compareSkillLists } = await import('./key-skills-set.js').then((m) => m.__test__);
const employmentAddCurrentTest = await import('./employment-add-current.js').then((m) => m.__test__);
const employmentEndTest = await import('./employment-end.js').then((m) => m.__test__);
const projectAddTest = await import('./projects-add.js').then((m) => m.__test__);
const projectOptionsTest = await import('./projects-options.js').then((m) => m.__test__);
const projectUpdateTest = await import('./projects-update.js').then((m) => m.__test__);

function profileText({ headline = 'Senior Full-Stack AI Engineer', summary = 'Builds AI products.', resumeFile = 'resume.pdf' } = {}) {
  return `
Gaurav Saxena
Senior Software Engineer
at Zetwerk Manufacturing
Profile last updated - Today
100 %
Jaipur, INDIA
Quick links
Resume
Resume headline
Key skills
Employment
Education
IT skills
Projects
Profile summary
Resume
${resumeFile}
Uploaded on  May 26, 2026
Update resume
Resume headline
editOneTheme
${headline}
Key skills
React
Node.js
Employment
Senior Software Engineer
Education
B.Tech / B.E.
IT skills
Node.js - 2025 5 Years 0 Month
Projects
Profile summary
editOneTheme
${summary}
Accomplishments
Career profile
Personal details
Diversity & inclusion
`;
}

describe('naukri write adapters', () => {
  it('registers write command shapes', () => {
    const headline = getRegistry().get('naukri/headline-set');
    const employmentAddCurrent = getRegistry().get('naukri/employment-add-current');
    const employmentEnd = getRegistry().get('naukri/employment-end');
    const employmentList = getRegistry().get('naukri/employment-list');
    const itSkillsDelete = getRegistry().get('naukri/it-skills-delete');
    const itSkills = getRegistry().get('naukri/it-skills-list');
    const itSkillsResolve = getRegistry().get('naukri/it-skills-resolve');
    const itSkillsSet = getRegistry().get('naukri/it-skills-set');
    const itSkillsUpsert = getRegistry().get('naukri/it-skills-upsert');
    const projectsAdd = getRegistry().get('naukri/projects-add');
    const projectsList = getRegistry().get('naukri/projects-list');
    const projectsOptions = getRegistry().get('naukri/projects-options');
    const projectsUpdate = getRegistry().get('naukri/projects-update');
    const list = getRegistry().get('naukri/key-skills-list');
    const resolve = getRegistry().get('naukri/key-skills-resolve');
    const set = getRegistry().get('naukri/key-skills-set');
    const suggest = getRegistry().get('naukri/key-skills-suggest');
    const summary = getRegistry().get('naukri/summary-set');
    const upload = getRegistry().get('naukri/resume-upload');

    expect(headline).toMatchObject({ access: 'write', browser: true, strategy: 'cookie' });
    expect(headline.columns).toEqual(['status', 'resume_headline']);
    expect(employmentAddCurrent).toMatchObject({ access: 'write', browser: true, strategy: 'cookie' });
    expect(employmentAddCurrent.columns).toEqual(['status', 'title', 'company']);
    expect(employmentEnd).toMatchObject({ access: 'write', browser: true, strategy: 'cookie' });
    expect(employmentEnd.columns).toEqual(['status', 'company', 'worked_till']);
    expect(employmentList).toMatchObject({ access: 'read', browser: true, strategy: 'cookie' });
    expect(employmentList.columns).toEqual(['rank', 'id', 'title', 'company', 'text']);
    expect(itSkills).toMatchObject({ access: 'read', browser: true, strategy: 'cookie' });
    expect(itSkills.columns).toEqual(['rank', 'id', 'skill', 'version', 'last_used', 'experience_years', 'experience_months']);
    expect(itSkillsDelete).toMatchObject({ access: 'write', browser: true, strategy: 'cookie' });
    expect(itSkillsDelete.columns).toEqual(['status', 'skill']);
    expect(itSkillsResolve).toMatchObject({ access: 'read', browser: true, strategy: 'cookie' });
    expect(itSkillsResolve.columns).toEqual(['input', 'resolved', 'status', 'confidence', 'alternatives']);
    expect(itSkillsSet).toMatchObject({ access: 'write', browser: true, strategy: 'cookie' });
    expect(itSkillsSet.columns).toEqual(['status', 'skills', 'missing', 'extra']);
    expect(itSkillsUpsert).toMatchObject({ access: 'write', browser: true, strategy: 'cookie' });
    expect(itSkillsUpsert.columns).toEqual(['status', 'skill', 'version', 'last_used', 'experience_years', 'experience_months']);
    expect(projectsAdd).toMatchObject({ access: 'write', browser: true, strategy: 'cookie' });
    expect(projectsAdd.columns).toEqual(['status', 'title']);
    expect(projectsList).toMatchObject({ access: 'read', browser: true, strategy: 'cookie' });
    expect(projectsList.columns).toEqual(['rank', 'title', 'text']);
    expect(projectsOptions).toMatchObject({ access: 'read', browser: true, strategy: 'cookie' });
    expect(projectsOptions.columns).toEqual(['kind', 'id', 'current', 'value', 'label']);
    expect(projectsUpdate).toMatchObject({ access: 'write', browser: true, strategy: 'cookie' });
    expect(projectsUpdate.columns).toEqual(['status', 'title', 'role', 'skills']);
    expect(list).toMatchObject({ access: 'read', browser: true, strategy: 'cookie' });
    expect(list.columns).toEqual(['rank', 'skill']);
    expect(resolve).toMatchObject({ access: 'read', browser: true, strategy: 'cookie' });
    expect(resolve.columns).toEqual(['input', 'resolved', 'status', 'confidence', 'alternatives']);
    expect(set).toMatchObject({ access: 'write', browser: true, strategy: 'cookie' });
    expect(set.columns).toEqual(['status', 'skills', 'missing', 'extra']);
    expect(suggest).toMatchObject({ access: 'read', browser: true, strategy: 'cookie' });
    expect(suggest.columns).toEqual(['rank', 'suggestion', 'source', 'endpoint']);
    expect(summary).toMatchObject({ access: 'write', browser: true, strategy: 'cookie' });
    expect(summary.columns).toEqual(['status', 'profile_summary']);
    expect(upload).toMatchObject({ access: 'write', browser: true, strategy: 'cookie' });
    expect(upload.columns).toEqual(['status', 'resume_file', 'resume_uploaded_on']);
  });

  it('validates required text without text-file variants', () => {
    expect(requireText('  hello  ', 'text', 10)).toBe('hello');
    expect(() => requireText('', 'text', 10)).toThrow(ArgumentError);
    expect(() => requireText('x'.repeat(11), 'text', 10)).toThrow(ArgumentError);
  });

  it('lists key skills from profile chips', async () => {
    const command = getRegistry().get('naukri/key-skills-list');
    const page = {
      goto: vi.fn(async () => {}),
      wait: vi.fn(async () => {}),
      autoScroll: vi.fn(async () => {}),
      evaluate: vi.fn(async () => ({
        url: 'https://www.naukri.com/mnjuser/profile',
        title: 'Profile | Mynaukri',
        text: profileText(),
        keySkills: ['React', 'Node.js'],
      })),
    };

    await expect(command.func(page)).resolves.toEqual([
      { rank: 1, skill: 'React' },
      { rank: 2, skill: 'Node.js' },
    ]);
  });

  it('normalizes IT skill rows', () => {
    expect(parseExperience('5 Years 0 Month')).toEqual({ years: '5', months: '0' });
    expect(parseExperience('-')).toEqual({ years: '', months: '' });
    expect(normalizeItSkillRows([
      { id: 'abc', skill: ' Node.js ', version: '-', last_used: '2025', experience: '5 Years 0 Month' },
      { id: 'empty', skill: '', version: '-', last_used: '-', experience: '-' },
    ])).toEqual([{
      id: 'abc',
      skill: 'Node.js',
      version: '',
      last_used: '2025',
      experience_years: '5',
      experience_months: '0',
    }]);
  });

  it('parses and compares IT skill replacement items', () => {
    const items = parseItSkillItems(JSON.stringify([
      { skill: ' Node.js ', version: '20', last_used: '2026', years: 5, months: 6 },
      { skill: 'node.js', version: '18', last_used: '2025', years: 4, months: 0 },
      { skill: 'React.js', lastUsed: '2026', experience_years: 4, experience_months: 6 },
    ]));
    expect(items).toEqual([
      { skill: 'Node.js', version: '20', last_used: '2026', experience_years: '5', experience_months: '6' },
      { skill: 'React.js', version: '', last_used: '2026', experience_years: '4', experience_months: '6' },
    ]);
    expect(normalizeItSkillItem({ skill: 'TypeScript', last_used: '2026' })).toEqual({
      skill: 'TypeScript',
      version: '',
      last_used: '2026',
      experience_years: '0',
      experience_months: '0',
    });
    expect(compareItSkillRows(items, items)).toEqual({ missing: [], extra: [] });
    expect(compareItSkillRows(items.slice(0, 1), items)).toEqual({ missing: [], extra: ['React.js'] });
  });

  it('rejects IT skill replacement lists above Naukri limit', () => {
    const items = Array.from({ length: 11 }, (_, index) => ({
      skill: `Skill ${index + 1}`,
      last_used: '2026',
      years: 1,
      months: 0,
    }));

    expect(() => parseItSkillItems(JSON.stringify(items))).toThrow(ArgumentError);
  });

  it('lists IT skills from profile table rows', async () => {
    const command = getRegistry().get('naukri/it-skills-list');
    const page = {
      goto: vi.fn(async () => {}),
      wait: vi.fn(async () => {}),
      autoScroll: vi.fn(async () => {}),
      evaluate: vi.fn(async () => ({
        url: 'https://www.naukri.com/mnjuser/profile',
        title: 'Profile | Mynaukri',
        text: profileText(),
        itSkills: [
          { id: 'node-id', skill: 'Node.js', version: '-', last_used: '2025', experience: '5 Years 0 Month' },
        ],
      })),
    };

    await expect(command.func(page)).resolves.toEqual([{
      rank: 1,
      id: 'node-id',
      skill: 'Node.js',
      version: '',
      last_used: '2025',
      experience_years: '5',
      experience_months: '0',
    }]);
  });

  it('validates employment date arguments', () => {
    expect(employmentAddCurrentTest.parseYear('2025', '--start-year')).toBe('2025');
    expect(employmentAddCurrentTest.parseMonth('Mar', '--start-month')).toBe('3');
    expect(employmentEndTest.parseMonth('Feb')).toBe('2');
    expect(() => employmentAddCurrentTest.parseYear('25', '--start-year')).toThrow(ArgumentError);
    expect(() => employmentEndTest.parseMonth('13')).toThrow(ArgumentError);
  });

  it('validates project date and status arguments', () => {
    expect(projectAddTest.parseYear('2026', '--start-year')).toBe('2026');
    expect(projectAddTest.parseMonth('May', '--start-month')).toBe('5');
    expect(projectAddTest.parseYear('2025', '--end-year')).toBe('2025');
    expect(projectAddTest.parseMonth('Feb', '--end-month')).toBe('2');
    expect(projectAddTest.parseStatus('in progress')).toBe('inprogress');
    expect(projectAddTest.parseStatus('finished')).toBe('finished');
    expect(() => projectAddTest.parseStatus('paused')).toThrow(ArgumentError);
    expect(() => projectAddTest.parseMonth('0', '--start-month')).toThrow(ArgumentError);
    expect(projectOptionsTest.parseLimit(20)).toBe(20);
    expect(() => projectOptionsTest.parseLimit(0)).toThrow(ArgumentError);
    expect(projectUpdateTest.parseNature('contractual')).toBe('contractual');
    expect(projectUpdateTest.parseNature('full time')).toBe('fullTime');
    expect(projectUpdateTest.parseLocationMode('remote')).toBe('offsite');
    expect(() => projectUpdateTest.parseNature('internship')).toThrow(ArgumentError);
  });

  it('resolves desired IT skills without saving', async () => {
    const command = getRegistry().get('naukri/it-skills-resolve');
    const page = {
      goto: vi.fn(async () => {}),
      wait: vi.fn(async () => {}),
      autoScroll: vi.fn(async () => {}),
      evaluate: vi.fn()
        .mockResolvedValueOnce({ ok: true, suggestions: ['React.js', 'React Native'] })
        .mockResolvedValueOnce({ ok: true, suggestions: ['Node.js'] }),
    };

    await expect(command.func(page, { skills: 'React, Node.js', limit: 2 })).resolves.toEqual([
      { input: 'React', resolved: 'React.js', status: 'ambiguous', confidence: 'low', alternatives: 'React Native' },
      { input: 'Node.js', resolved: 'Node.js', status: 'exact', confidence: 'high', alternatives: '' },
    ]);
  });

  it('upserts one IT skill and verifies readback', async () => {
    const command = getRegistry().get('naukri/it-skills-upsert');
    const page = {
      goto: vi.fn(async () => {}),
      wait: vi.fn(async () => {}),
      autoScroll: vi.fn(async () => {}),
      evaluate: vi.fn()
        .mockResolvedValueOnce({
          url: 'https://www.naukri.com/mnjuser/profile',
          title: 'Profile | Mynaukri',
          text: profileText(),
          itSkills: [],
        })
        .mockResolvedValueOnce({ ok: true, status: 'updated' })
        .mockResolvedValueOnce({
          url: 'https://www.naukri.com/mnjuser/profile',
          title: 'Profile | Mynaukri',
          text: profileText(),
          itSkills: [
            { id: 'node-id', skill: 'Node.js', version: '20', last_used: '2026', experience: '5 Years 6 Months' },
          ],
        }),
    };

    await expect(command.func(page, {
      skill: 'Node.js',
      version: '20',
      'last-used': '2026',
      years: 5,
      months: 6,
    })).resolves.toEqual([{
      status: 'updated',
      skill: 'Node.js',
      version: '20',
      last_used: '2026',
      experience_years: '5',
      experience_months: '6',
    }]);
  });

  it('rejects creating an IT skill when profile is already at the Naukri limit', async () => {
    const command = getRegistry().get('naukri/it-skills-upsert');
    const page = {
      goto: vi.fn(async () => {}),
      wait: vi.fn(async () => {}),
      autoScroll: vi.fn(async () => {}),
      evaluate: vi.fn(async () => ({
        url: 'https://www.naukri.com/mnjuser/profile',
        title: 'Profile | Mynaukri',
        text: profileText(),
        itSkills: Array.from({ length: 10 }, (_, index) => ({
          id: `id-${index}`,
          skill: `Skill ${index}`,
          version: '-',
          last_used: '2026',
          experience: '1 Year 0 Month',
        })),
      })),
    };

    await expect(command.func(page, {
      skill: 'New Skill',
      version: '',
      'last-used': '2026',
      years: 1,
      months: 0,
    })).rejects.toThrow(ArgumentError);
  });

  it('deletes one IT skill and verifies absence', async () => {
    const command = getRegistry().get('naukri/it-skills-delete');
    const page = {
      goto: vi.fn(async () => {}),
      wait: vi.fn(async () => {}),
      autoScroll: vi.fn(async () => {}),
      evaluate: vi.fn()
        .mockResolvedValueOnce({ ok: true, status: 'deleted' })
        .mockResolvedValueOnce({
          url: 'https://www.naukri.com/mnjuser/profile',
          title: 'Profile | Mynaukri',
          text: profileText(),
          itSkills: [],
        }),
    };

    await expect(command.func(page, { skill: 'Angular' })).resolves.toEqual([{ status: 'deleted', skill: 'Angular' }]);
  });

  it('replaces IT skills and verifies final rows', async () => {
    const command = getRegistry().get('naukri/it-skills-set');
    const items = JSON.stringify([{ skill: 'Node.js', version: '20', last_used: '2026', years: 5, months: 6 }]);
    const page = {
      goto: vi.fn(async () => {}),
      wait: vi.fn(async () => {}),
      autoScroll: vi.fn(async () => {}),
      evaluate: vi.fn()
        .mockResolvedValueOnce({
          url: 'https://www.naukri.com/mnjuser/profile',
          title: 'Profile | Mynaukri',
          text: profileText(),
          itSkills: [{ id: 'angular-id', skill: 'Angular', version: '-', last_used: '2025', experience: '5 Years 0 Month' }],
        })
        .mockResolvedValueOnce({ ok: true, status: 'deleted' })
        .mockResolvedValueOnce({ ok: true, status: 'created' })
        .mockResolvedValueOnce({
          url: 'https://www.naukri.com/mnjuser/profile',
          title: 'Profile | Mynaukri',
          text: profileText(),
          itSkills: [{ id: 'node-id', skill: 'Node.js', version: '20', last_used: '2026', experience: '5 Years 6 Months' }],
        }),
    };

    await expect(command.func(page, { items })).resolves.toEqual([{
      status: 'updated',
      skills: 'Node.js',
      missing: '',
      extra: '',
    }]);
  });

  it('validates key skill suggest limit', () => {
    expect(parseLimit(5)).toBe(5);
    expect(() => parseLimit(0)).toThrow(ArgumentError);
    expect(() => parseLimit(26)).toThrow(ArgumentError);
  });

  it('classifies resolved key skill suggestions', () => {
    expect(resolveSkill('Next.js', ['Next.js'])).toMatchObject({ resolved: 'Next.js', status: 'exact', confidence: 'high' });
    expect(resolveSkill('React', ['React.js', 'React Native'])).toMatchObject({ resolved: 'React.js', status: 'ambiguous', confidence: 'low' });
    expect(resolveSkill('OpenAI API', [])).toMatchObject({ resolved: '', status: 'missing', confidence: 'none' });
  });

  it('compares key skill lists case-insensitively', () => {
    expect(compareSkillLists(['React.js', 'Docker'], ['react.js', 'Docker'])).toEqual({ missing: [], extra: [] });
    expect(compareSkillLists(['React.js'], ['React.js', 'Angular'])).toEqual({ missing: [], extra: ['Angular'] });
  });

  it('sets key skills and verifies readback', async () => {
    const command = getRegistry().get('naukri/key-skills-set');
    const skills = 'React.js, TypeScript';
    const page = {
      goto: vi.fn(async () => {}),
      wait: vi.fn(async () => {}),
      autoScroll: vi.fn(async () => {}),
      evaluate: vi.fn()
        .mockResolvedValueOnce({ ok: true, added: ['React.js', 'TypeScript'], failures: [] })
        .mockResolvedValueOnce({
          url: 'https://www.naukri.com/mnjuser/profile',
          title: 'Profile | Mynaukri',
          text: profileText(),
          keySkills: ['React.js', 'TypeScript'],
        }),
    };

    await expect(command.func(page, { skills })).resolves.toEqual([{
      status: 'updated',
      skills,
      missing: '',
      extra: '',
    }]);
  });

  it('resolves desired key skills without saving', async () => {
    const command = getRegistry().get('naukri/key-skills-resolve');
    const page = {
      goto: vi.fn(async () => {}),
      wait: vi.fn(async () => {}),
      autoScroll: vi.fn(async () => {}),
      evaluate: vi.fn()
        .mockResolvedValueOnce({ ok: true, suggestions: ['React.js', 'React Native'] })
        .mockResolvedValueOnce({ ok: true, suggestions: ['Next.js'] }),
    };

    await expect(command.func(page, { skills: 'React, Next.js', limit: 2 })).resolves.toEqual([
      { input: 'React', resolved: 'React.js', status: 'ambiguous', confidence: 'low', alternatives: 'React Native' },
      { input: 'Next.js', resolved: 'Next.js', status: 'exact', confidence: 'high', alternatives: '' },
    ]);
  });

  it('inspects key skill suggestions without saving', async () => {
    const command = getRegistry().get('naukri/key-skills-suggest');
    const page = {
      goto: vi.fn(async () => {}),
      wait: vi.fn(async () => {}),
      autoScroll: vi.fn(async () => {}),
      evaluate: vi.fn(async () => ({
        ok: true,
        suggestions: ['React.js', 'React Native'],
        endpoint: 'https://www.naukri.com/suggest',
        requests: [{ type: 'xhr' }],
      })),
    };

    await expect(command.func(page, { query: 'react', limit: 2 })).resolves.toEqual([
      { rank: 1, suggestion: 'React.js', source: 'autocomplete-network', endpoint: 'https://www.naukri.com/suggest' },
      { rank: 2, suggestion: 'React Native', source: 'autocomplete-network', endpoint: 'https://www.naukri.com/suggest' },
    ]);
  });

  it('updates headline and verifies readback', async () => {
    const command = getRegistry().get('naukri/headline-set');
    const text = 'Senior Full-Stack AI Engineer | React, Node.js, TypeScript';
    const page = {
      goto: vi.fn(async () => {}),
      wait: vi.fn(async () => {}),
      autoScroll: vi.fn(async () => {}),
      evaluate: vi.fn()
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({ ok: true, actual: text })
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce({
          url: 'https://www.naukri.com/mnjuser/profile',
          title: 'Profile | Mynaukri',
          text: profileText({ headline: text }),
        }),
    };

    await expect(command.func(page, { text })).resolves.toEqual([{ status: 'updated', resume_headline: text }]);
    expect(page.goto).toHaveBeenCalledWith('https://www.naukri.com/mnjuser/profile');
  });

  it('updates profile summary and verifies readback', async () => {
    const command = getRegistry().get('naukri/summary-set');
    const text = 'Senior Full-Stack AI Engineer building AI agents, RAG workflows, and automation systems.';
    const page = {
      goto: vi.fn(async () => {}),
      wait: vi.fn(async () => {}),
      autoScroll: vi.fn(async () => {}),
      evaluate: vi.fn()
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({ ok: true, actual: text })
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce({
          url: 'https://www.naukri.com/mnjuser/profile',
          title: 'Profile | Mynaukri',
          text: profileText({ summary: text }),
        }),
    };

    await expect(command.func(page, { text })).resolves.toEqual([{ status: 'updated', profile_summary: text }]);
  });

  it('fails if write readback does not match', async () => {
    const command = getRegistry().get('naukri/headline-set');
    const page = {
      goto: vi.fn(async () => {}),
      wait: vi.fn(async () => {}),
      autoScroll: vi.fn(async () => {}),
      evaluate: vi.fn()
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({ ok: true, actual: 'new headline' })
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce({
          url: 'https://www.naukri.com/mnjuser/profile',
          title: 'Profile | Mynaukri',
          text: profileText({ headline: 'old headline' }),
        }),
    };

    await expect(command.func(page, { text: 'new headline' })).rejects.toThrow(CommandExecutionError);
  });

  it('validates resume file path and format', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencli-naukri-resume-'));
    const pdf = path.join(dir, 'resume.pdf');
    const txt = path.join(dir, 'resume.txt');
    fs.writeFileSync(pdf, 'pdf');
    fs.writeFileSync(txt, 'txt');

    expect(requireResumePath(pdf)).toBe(pdf);
    expect(() => requireResumePath(path.join(dir, 'missing.pdf'))).toThrow(ArgumentError);
    expect(() => requireResumePath(txt)).toThrow(ArgumentError);
  });

  it('uploads resume and verifies filename readback', async () => {
    const command = getRegistry().get('naukri/resume-upload');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencli-naukri-upload-'));
    const pdf = path.join(dir, 'gaurav-saxena-senior-full-stack-ai-engineer-cv.pdf');
    fs.writeFileSync(pdf, 'pdf');
    const page = {
      goto: vi.fn(async () => {}),
      wait: vi.fn(async () => {}),
      autoScroll: vi.fn(async () => {}),
      setFileInput: vi.fn(async () => {}),
      evaluate: vi.fn()
        .mockResolvedValueOnce('input[data-opencli-naukri-resume-input="true"]')
        .mockResolvedValueOnce({ ok: true, files: [path.basename(pdf)] })
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce({
          url: 'https://www.naukri.com/mnjuser/profile',
          title: 'Profile | Mynaukri',
          text: profileText({ resumeFile: path.basename(pdf) }),
        }),
    };

    await expect(command.func(page, { file: pdf })).resolves.toEqual([{
      status: 'uploaded',
      resume_file: path.basename(pdf),
      resume_uploaded_on: 'May 26, 2026',
    }]);
    expect(page.setFileInput).toHaveBeenCalledWith([pdf], 'input[data-opencli-naukri-resume-input="true"]');
  });
});
