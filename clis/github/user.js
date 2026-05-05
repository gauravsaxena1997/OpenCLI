// github user — fetch a public GitHub user profile via REST API v3.
import { cli, Strategy } from '@jackwener/opencli/registry';
import { ghFetch, normalizeUsername, isoDate, asString } from './utils.js';

cli({
    site: 'github',
    name: 'user',
    access: 'read',
    description: 'Public GitHub user profile (login, bio, followers, repos count, etc.)',
    domain: 'github.com',
    strategy: Strategy.PUBLIC,
    browser: false,
    args: [
        { name: 'username', positional: true, required: true, type: 'string', help: 'GitHub login (with or without leading @)' },
    ],
    columns: [
        'login', 'name', 'bio', 'company', 'location', 'blog',
        'followers', 'following', 'publicRepos', 'publicGists',
        'createdAt', 'updatedAt', 'url',
    ],
    func: async (args) => {
        const login = normalizeUsername(args.username, 'username');
        const data = await ghFetch(`/users/${login}`);
        return [{
            login: data.login,
            name: asString(data.name),
            bio: asString(data.bio),
            company: asString(data.company),
            location: asString(data.location),
            blog: asString(data.blog),
            followers: data.followers ?? 0,
            following: data.following ?? 0,
            publicRepos: data.public_repos ?? 0,
            publicGists: data.public_gists ?? 0,
            createdAt: isoDate(data.created_at),
            updatedAt: isoDate(data.updated_at),
            url: data.html_url || `https://github.com/${data.login}`,
        }];
    },
});
