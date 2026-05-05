// github releases — list a repo's releases.
import { cli, Strategy } from '@jackwener/opencli/registry';
import { EmptyResultError } from '@jackwener/opencli/errors';
import { ghFetch, parseOwnerRepo, normalizeLimit, isoDate, asString } from './utils.js';

cli({
    site: 'github',
    name: 'releases',
    access: 'read',
    description: 'List a public repository\'s releases (newest first).',
    domain: 'github.com',
    strategy: Strategy.PUBLIC,
    browser: false,
    args: [
        { name: 'repo', positional: true, required: true, type: 'string', help: 'owner/repo (e.g. nodejs/node)' },
        { name: 'limit', type: 'int', default: 20, help: 'Max releases to return (max 100; one API page).' },
    ],
    columns: ['tagName', 'name', 'publishedAt', 'prerelease', 'draft', 'author', 'url'],
    func: async (args) => {
        const { owner, repo } = parseOwnerRepo(args.repo, 'repo');
        const limit = normalizeLimit(args.limit, 20, 100, 'limit');
        const data = await ghFetch(`/repos/${owner}/${repo}/releases`, {
            searchParams: { per_page: limit },
        });
        const list = Array.isArray(data) ? data : [];
        if (list.length === 0) {
            throw new EmptyResultError('github releases', `No releases found for ${owner}/${repo}.`);
        }
        return list.slice(0, limit).map((r) => ({
            tagName: r.tag_name || '',
            name: asString(r.name),
            publishedAt: isoDate(r.published_at),
            prerelease: Boolean(r.prerelease),
            draft: Boolean(r.draft),
            author: r.author?.login || '',
            url: r.html_url || `https://github.com/${owner}/${repo}/releases/tag/${r.tag_name}`,
        }));
    },
});
