// github user-repos — list public repositories for a given user.
import { cli, Strategy } from '@jackwener/opencli/registry';
import { EmptyResultError } from '@jackwener/opencli/errors';
import {
    ghFetch,
    normalizeUsername,
    normalizeLimit,
    normalizeEnum,
    isoDate,
    asString,
} from './utils.js';

const SORT_OPTIONS = ['updated', 'created', 'pushed', 'full_name'];
const TYPE_OPTIONS = ['all', 'owner', 'member'];

cli({
    site: 'github',
    name: 'user-repos',
    access: 'read',
    description: 'List public repositories owned by a GitHub user.',
    domain: 'github.com',
    strategy: Strategy.PUBLIC,
    browser: false,
    args: [
        { name: 'username', positional: true, required: true, type: 'string', help: 'GitHub login' },
        { name: 'sort', type: 'string', default: 'updated', help: `Sort key: ${SORT_OPTIONS.join(', ')}` },
        { name: 'type', type: 'string', default: 'owner', help: `Filter: ${TYPE_OPTIONS.join(', ')}` },
        { name: 'limit', type: 'int', default: 30, help: 'Max repos to return (max 100; one API page).' },
    ],
    columns: ['name', 'fullName', 'description', 'language', 'stars', 'forks', 'archived', 'fork', 'updatedAt', 'pushedAt', 'url'],
    func: async (args) => {
        const login = normalizeUsername(args.username, 'username');
        const sort = normalizeEnum(args.sort, SORT_OPTIONS, 'updated', 'sort');
        const type = normalizeEnum(args.type, TYPE_OPTIONS, 'owner', 'type');
        const limit = normalizeLimit(args.limit, 30, 100, 'limit');
        const data = await ghFetch(`/users/${login}/repos`, {
            searchParams: { sort, type, per_page: limit, direction: 'desc' },
        });
        const list = Array.isArray(data) ? data : [];
        if (list.length === 0) {
            throw new EmptyResultError('github user-repos', `User ${login} has no public repositories matching this filter.`);
        }
        return list.slice(0, limit).map((r) => ({
            name: r.name || '',
            fullName: r.full_name || '',
            description: asString(r.description),
            language: asString(r.language),
            stars: r.stargazers_count ?? 0,
            forks: r.forks_count ?? 0,
            archived: Boolean(r.archived),
            fork: Boolean(r.fork),
            updatedAt: isoDate(r.updated_at),
            pushedAt: isoDate(r.pushed_at),
            url: r.html_url || (r.full_name ? `https://github.com/${r.full_name}` : ''),
        }));
    },
});
