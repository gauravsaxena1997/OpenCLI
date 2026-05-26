import { cli, Strategy } from '@jackwener/opencli/registry';
import { ArgumentError, CommandExecutionError } from '@jackwener/opencli/errors';
import {
  buildDeleteItSkillScript,
  ensureProfilePage,
  normalizeWhitespace,
  readItSkills,
} from './shared.js';

cli({
  site: 'naukri',
  name: 'it-skills-delete',
  access: 'write',
  description: 'Delete one Naukri IT skill by exact skill/software label',
  domain: 'www.naukri.com',
  strategy: Strategy.COOKIE,
  browser: true,
  navigateBefore: false,
  args: [
    { name: 'skill', type: 'str', required: true, help: 'Exact IT skill/software label to delete' },
  ],
  columns: ['status', 'skill'],
  func: async (page, kwargs) => {
    if (!page) throw new CommandExecutionError('Browser session required for naukri it-skills-delete');
    const skill = normalizeWhitespace(kwargs.skill);
    if (!skill) throw new ArgumentError('--skill is required');
    await ensureProfilePage(page);
    const result = await page.evaluate(buildDeleteItSkillScript(skill));
    if (!result?.ok) {
      throw new CommandExecutionError(
        `Could not delete Naukri IT skill: ${result?.error || 'it_skill_delete_failed'}`,
        JSON.stringify(result || {}, null, 2),
      );
    }
    await page.wait(3);
    const remaining = await readItSkills(page);
    const exists = remaining.some((row) => row.skill.toLowerCase() === skill.toLowerCase());
    if (exists) throw new CommandExecutionError('Naukri IT skill still exists after delete', skill);
    return [{ status: result.status || 'deleted', skill }];
  },
});
