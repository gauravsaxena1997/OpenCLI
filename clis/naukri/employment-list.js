import { cli, Strategy } from '@jackwener/opencli/registry';
import { CommandExecutionError } from '@jackwener/opencli/errors';
import { ensureProfilePage, normalizeWhitespace } from './shared.js';

export const EMPLOYMENT_COLUMNS = ['rank', 'id', 'title', 'company', 'text'];

export async function readEmploymentRows(page) {
  await ensureProfilePage(page);
  const rows = await page.evaluate(String.raw`(() => {
    const clean = (value) => String(value || '').replace(/[\u00a0\u202f]+/g, ' ').replace(/\s+/g, ' ').trim();
    return Array.from(document.querySelectorAll('.emp-list'))
      .map((row) => {
        const text = clean(row.innerText || row.textContent);
        const title = clean(row.querySelector('.desg, .emp-desg, [class*="desg"]')?.innerText || '');
        const company = clean(row.querySelector('.emp-org, [class*="emp-org"]')?.innerText || '');
        const edit = row.querySelector('[data-prefillid]');
        return {
          id: clean(row.getAttribute('data-prefillid') || edit?.getAttribute('data-prefillid') || ''),
          title: title || clean(text.split(/\s{2,}|\n/)[0] || ''),
          company,
          text,
        };
      })
      .filter((row) => row.text);
  })()`);
  return rows.map((row) => ({
    id: normalizeWhitespace(row.id),
    title: normalizeWhitespace(row.title),
    company: normalizeWhitespace(row.company),
    text: normalizeWhitespace(row.text),
  }));
}

cli({
  site: 'naukri',
  name: 'employment-list',
  access: 'read',
  description: 'List visible Naukri employment entries',
  domain: 'www.naukri.com',
  strategy: Strategy.COOKIE,
  browser: true,
  navigateBefore: false,
  args: [],
  columns: EMPLOYMENT_COLUMNS,
  func: async (page) => {
    if (!page) throw new CommandExecutionError('Browser session required for naukri employment-list');
    const rows = await readEmploymentRows(page);
    return rows.map((row, index) => ({ rank: index + 1, ...row }));
  },
});
