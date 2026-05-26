import { cli, Strategy } from '@jackwener/opencli/registry';
import { ArgumentError, CommandExecutionError } from '@jackwener/opencli/errors';
import {
  buildItSkillSuggestionScript,
  ensureProfilePage,
  normalizeSkillList,
  normalizeWhitespace,
} from './shared.js';
import { resolveSkill } from './key-skills-resolve.js';

function parseLimit(value) {
  const limit = Number.parseInt(String(value ?? '8'), 10);
  if (!Number.isFinite(limit) || limit < 1 || limit > 15) {
    throw new ArgumentError('--limit must be between 1 and 15');
  }
  return limit;
}

cli({
  site: 'naukri',
  name: 'it-skills-resolve',
  access: 'read',
  description: 'Resolve desired Naukri IT skill/software labels against the autocomplete without saving changes',
  domain: 'www.naukri.com',
  strategy: Strategy.COOKIE,
  browser: true,
  navigateBefore: false,
  args: [
    { name: 'skills', type: 'str', required: true, help: 'Comma, semicolon, or newline separated desired IT skill/software labels' },
    { name: 'limit', type: 'int', default: 8, help: 'Max suggestions to inspect per skill (1-15)' },
  ],
  columns: ['input', 'resolved', 'status', 'confidence', 'alternatives'],
  func: async (page, kwargs) => {
    if (!page) throw new CommandExecutionError('Browser session required for naukri it-skills-resolve');
    const skills = normalizeSkillList(kwargs.skills);
    if (!skills.length) throw new ArgumentError('--skills is required');
    const limit = parseLimit(kwargs.limit);
    await ensureProfilePage(page);

    const rows = [];
    for (const skill of skills) {
      const result = await page.evaluate(buildItSkillSuggestionScript(skill, limit));
      if (!result?.ok) {
        rows.push({
          input: skill,
          resolved: '',
          status: 'error',
          confidence: 'none',
          alternatives: normalizeWhitespace(result?.error) || 'it_skill_resolution_failed',
        });
        continue;
      }
      rows.push(resolveSkill(skill, result.suggestions || []));
    }
    return rows;
  },
});

export const __test__ = {
  parseLimit,
};
