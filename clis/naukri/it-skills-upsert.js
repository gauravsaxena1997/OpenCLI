import { cli, Strategy } from '@jackwener/opencli/registry';
import { ArgumentError, CommandExecutionError } from '@jackwener/opencli/errors';
import {
  buildUpsertItSkillScript,
  compareItSkillRows,
  ensureProfilePage,
  IT_SKILLS_LIMIT,
  normalizeItSkillItem,
  normalizeWhitespace,
  readItSkills,
} from './shared.js';

function parseYear(value, fieldName) {
  const year = normalizeWhitespace(value);
  if (!/^\d{4}$/.test(year)) throw new ArgumentError(`${fieldName} must be a 4 digit year`);
  return year;
}

function parseRange(value, fieldName, max) {
  const parsed = Number.parseInt(String(value ?? '0'), 10);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > max) {
    throw new ArgumentError(`${fieldName} must be between 0 and ${max}`);
  }
  return String(parsed);
}

cli({
  site: 'naukri',
  name: 'it-skills-upsert',
  access: 'write',
  description: 'Create or update one Naukri IT skill with version, last used year, and experience',
  domain: 'www.naukri.com',
  strategy: Strategy.COOKIE,
  browser: true,
  navigateBefore: false,
  args: [
    { name: 'skill', type: 'str', required: true, help: 'Naukri IT skill/software label' },
    { name: 'match-skill', type: 'str', default: '', help: 'Optional existing skill/software label to edit instead of matching --skill' },
    { name: 'version', type: 'str', default: '', help: 'Optional software version' },
    { name: 'last-used', type: 'str', required: true, help: 'Last used year, for example 2026' },
    { name: 'years', type: 'int', default: 0, help: 'Experience years' },
    { name: 'months', type: 'int', default: 0, help: 'Experience months' },
  ],
  columns: ['status', 'skill', 'version', 'last_used', 'experience_years', 'experience_months'],
  func: async (page, kwargs) => {
    if (!page) throw new CommandExecutionError('Browser session required for naukri it-skills-upsert');
    const item = normalizeItSkillItem({
      skill: kwargs.skill,
      version: kwargs.version,
      last_used: parseYear(kwargs['last-used'], '--last-used'),
      years: parseRange(kwargs.years, '--years', 50),
      months: parseRange(kwargs.months, '--months', 11),
    });
    await ensureProfilePage(page);
    const beforeRows = await readItSkills(page);
    const matchSkill = normalizeWhitespace(kwargs['match-skill']);
    const existingMatch = beforeRows.some((row) => row.skill.toLowerCase() === item.skill.toLowerCase() || (matchSkill && row.skill.toLowerCase() === matchSkill.toLowerCase()));
    if (!existingMatch && beforeRows.length >= IT_SKILLS_LIMIT) {
      throw new ArgumentError(
        `Naukri IT skills supports at most ${IT_SKILLS_LIMIT} rows`,
        `Current rows: ${beforeRows.length}. Use --match-skill to replace an existing row, or it-skills-delete before adding.`,
      );
    }
    const result = await page.evaluate(buildUpsertItSkillScript(item, kwargs['match-skill']));
    if (!result?.ok) {
      throw new CommandExecutionError(
        `Could not upsert Naukri IT skill: ${result?.error || 'it_skill_upsert_failed'}`,
        JSON.stringify(result || {}, null, 2),
      );
    }
    await page.wait(4);
    const savedRows = await readItSkills(page);
    const diff = compareItSkillRows([item], savedRows.filter((row) => row.skill.toLowerCase() === item.skill.toLowerCase()));
    if (diff.missing.length) {
      throw new CommandExecutionError('Naukri IT skill did not match after save', `Missing: ${diff.missing.join(', ')}`);
    }
    return [{ status: result.status || 'upserted', ...item }];
  },
});

export const __test__ = {
  parseRange,
  parseYear,
};
