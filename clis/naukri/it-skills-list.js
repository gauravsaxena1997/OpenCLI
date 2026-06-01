import { cli, Strategy } from '@jackwener/opencli/registry';
import { CommandExecutionError } from '@jackwener/opencli/errors';
import { readItSkills } from './shared.js';

export const IT_SKILLS_COLUMNS = [
  'rank',
  'id',
  'skill',
  'version',
  'last_used',
  'experience_years',
  'experience_months',
];

cli({
  site: 'naukri',
  name: 'it-skills-list',
  access: 'read',
  description: 'List current Naukri IT skills with version, last used year, and experience',
  domain: 'www.naukri.com',
  strategy: Strategy.COOKIE,
  browser: true,
  navigateBefore: false,
  args: [],
  columns: IT_SKILLS_COLUMNS,
  func: async (page) => {
    if (!page) throw new CommandExecutionError('Browser session required for naukri it-skills-list');
    const rows = await readItSkills(page);
    return rows.map((row, index) => ({
      rank: index + 1,
      ...row,
    }));
  },
});
