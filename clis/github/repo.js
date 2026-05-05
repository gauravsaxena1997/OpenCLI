// github repo — fetch a public repository's metadata.
import { cli, Strategy } from '@jackwener/opencli/registry';
import { ghFetch, parseOwnerRepo, isoDate, asString } from './utils.js';

cli({
    site: 'github',
    name: 'repo',
    access: 'read',
    description: 'Public GitHub repository metadata (stars, forks, language, license, dates).',
    domain: 'github.com',
    strategy: Strategy.PUBLIC,
    browser: false,
    args: [
        { name: 'repo', positional: true, required: true, type: 'string', help: 'owner/repo (e.g. facebook/react)' },
    ],
    columns: [
        'fullName', 'description', 'language', 'stars', 'forks',
        'openIssues', 'watchers', 'license', 'defaultBranch',
        'archived', 'fork', 'createdAt', 'updatedAt', 'pushedAt', 'url',
    ],
    func: async (args) => {
        const { owner, repo } = parseOwnerRepo(args.repo, 'repo');
        const data = await ghFetch(`/repos/${owner}/${repo}`);
        return [{
            fullName: data.full_name,
            description: asString(data.description),
            language: asString(data.language),
            stars: data.stargazers_count ?? 0,
            forks: data.forks_count ?? 0,
            openIssues: data.open_issues_count ?? 0,
            watchers: data.subscribers_count ?? data.watchers_count ?? 0,
            license: data.license?.spdx_id || data.license?.name || '',
            defaultBranch: data.default_branch || '',
            archived: Boolean(data.archived),
            fork: Boolean(data.fork),
            createdAt: isoDate(data.created_at),
            updatedAt: isoDate(data.updated_at),
            pushedAt: isoDate(data.pushed_at),
            url: data.html_url || `https://github.com/${data.full_name}`,
        }];
    },
});
