import { cli, Strategy } from '@jackwener/opencli/registry';
import { CommandExecutionError } from '@jackwener/opencli/errors';
import { ensureProfilePage, normalizeWhitespace } from './shared.js';

export const PROJECT_COLUMNS = ['rank', 'title', 'text'];

export async function readProjects(page) {
  await ensureProfilePage(page);
  const rows = await page.evaluate(String.raw`(() => {
    const clean = (value) => String(value || '').replace(/[\u00a0\u202f]+/g, ' ').replace(/\s+/g, ' ').trim();
    const section = document.getElementById('lazyProject') || document.getElementById('lazyProjects') || Array.from(document.querySelectorAll('[id]')).find((el) => /project/i.test(el.id));
    if (!section) return [];
    const candidates = Array.from(section.querySelectorAll('li.collection, .collection, [data-prefillid], .card, .project, div'));
    return candidates
      .map((el) => clean(el.innerText || el.textContent))
      .filter((text) => text && text.length > 20 && !/^Projects?\s*(Add project)?$/i.test(text))
      .filter((text) => !/Stand out to employers by adding details about projects/i.test(text))
      .filter((text) => (text.match(/editOneTheme/g) || []).length === 1 && /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}\s+to\b/.test(text))
      .map((text) => ({ title: clean((text.split('editOneTheme')[0] || text)).slice(0, 120), text }));
  })()`);
  const seen = new Set();
  return rows.filter((row) => {
    const key = normalizeWhitespace(row.text).toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

cli({
  site: 'naukri',
  name: 'projects-list',
  access: 'read',
  description: 'List visible Naukri profile projects',
  domain: 'www.naukri.com',
  strategy: Strategy.COOKIE,
  browser: true,
  navigateBefore: false,
  args: [],
  columns: PROJECT_COLUMNS,
  func: async (page) => {
    if (!page) throw new CommandExecutionError('Browser session required for naukri projects-list');
    const projects = await readProjects(page);
    return projects.map((row, index) => ({ rank: index + 1, ...row }));
  },
});
