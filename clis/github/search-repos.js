// github search-repos — search public repositories.
import { cli, Strategy } from '@jackwener/opencli/registry';
import { EmptyResultError } from '@jackwener/opencli/errors';
import { ghFetch, normalizeLimit, normalizeEnum, isoDate, asString } from './utils.js';

const SORT_OPTIONS = ['stars', 'forks', 'updated', 'help-wanted-issues'];
const ORDER_OPTIONS = ['desc', 'asc'];

cli({
    site: 'github',
    name: 'search-repos',
    access: 'read',
    description: 'Search public repositories on GitHub.',
    domain: 'github.com',
    strategy: Strategy.PUBLIC,
    browser: false,
    args: [
        { name: 'query', positional: true, required: true, type: 'string', help: 'Search query (supports GitHub search syntax e.g. "react language:typescript")' },
        { name: 'sort', type: 'string', default: 'stars', help: `Sort key: ${SORT_OPTIONS.join(', ')}` },
        { name: 'order', type: 'string', default: 'desc', help: `Order: ${ORDER_OPTIONS.join(', ')}` },
        { name: 'limit', type: 'int', default: 20, help: 'Max repos to return (max 100; one API page).' },
    ],
    columns: ['fullName', 'description', 'language', 'stars', 'forks', 'updatedAt', 'url'],
    func: async (args) => {
        const sort = normalizeEnum(args.sort, SORT_OPTIONS, 'stars', 'sort');
        const order = normalizeEnum(args.order, ORDER_OPTIONS, 'desc', 'order');
        const limit = normalizeLimit(args.limit, 20, 100, 'limit');
        const data = await ghFetch('/search/repositories', {
            searchParams: {
                q: String(args.query || '').trim(),
                sort,
                order,
                per_page: limit,
            },
        });
        const items = Array.isArray(data?.items) ? data.items : [];
        if (items.length === 0) {
            throw new EmptyResultError('github search-repos', 'No repositories matched the query.');
        }
        return items.slice(0, limit).map((r) => ({
            fullName: r.full_name,
            description: asString(r.description),
            language: asString(r.language),
            stars: r.stargazers_count ?? 0,
            forks: r.forks_count ?? 0,
            updatedAt: isoDate(r.updated_at),
            url: r.html_url || `https://github.com/${r.full_name}`,
        }));
    },
});
