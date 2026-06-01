import { cli, Strategy } from '@jackwener/opencli/registry';
import { CommandExecutionError } from '@jackwener/opencli/errors';
import {
  buildDeleteItSkillScript,
  buildUpsertItSkillScript,
  compareItSkillRows,
  ensureProfilePage,
  parseItSkillItems,
  readItSkills,
} from './shared.js';

function format(values) {
  return values.length ? values.join(', ') : 'none';
}

cli({
  site: 'naukri',
  name: 'it-skills-set',
  access: 'write',
  description: 'Replace Naukri IT skills with an explicit JSON array and verify the saved rows',
  domain: 'www.naukri.com',
  strategy: Strategy.COOKIE,
  browser: true,
  navigateBefore: false,
  args: [
    { name: 'items', type: 'str', required: true, help: 'JSON array of {skill,version,last_used,years,months}' },
  ],
  columns: ['status', 'skills', 'missing', 'extra'],
  func: async (page, kwargs) => {
    if (!page) throw new CommandExecutionError('Browser session required for naukri it-skills-set');
    const items = parseItSkillItems(kwargs.items);
    await ensureProfilePage(page);
    const existingRows = await readItSkills(page);
    const desiredKeys = new Set(items.map((item) => item.skill.toLowerCase()));
    const keptKeys = new Set();
    for (const row of existingRows) {
      const key = row.skill.toLowerCase();
      if (desiredKeys.has(key) && !keptKeys.has(key)) {
        keptKeys.add(key);
        continue;
      }
      const deleted = await page.evaluate(buildDeleteItSkillScript(row.skill, row.id));
      if (!deleted?.ok) {
        throw new CommandExecutionError(`Could not delete Naukri IT skill: ${row.skill}`, JSON.stringify(deleted || {}, null, 2));
      }
      await page.wait(2);
    }
    for (const item of items) {
      const saved = await page.evaluate(buildUpsertItSkillScript(item));
      if (!saved?.ok) {
        throw new CommandExecutionError(`Could not save Naukri IT skill: ${item.skill}`, JSON.stringify(saved || {}, null, 2));
      }
      await page.wait(2);
    }
    await page.wait(4);
    const savedRows = await readItSkills(page);
    const diff = compareItSkillRows(items, savedRows);
    if (diff.missing.length || diff.extra.length) {
      throw new CommandExecutionError(
        'Naukri IT skills did not match after save',
        `Missing: ${format(diff.missing)}; Extra: ${format(diff.extra)}`,
      );
    }
    return [{
      status: 'updated',
      skills: savedRows.map((row) => row.skill).join(', '),
      missing: '',
      extra: '',
    }];
  },
});

export const __test__ = {
  format,
};
