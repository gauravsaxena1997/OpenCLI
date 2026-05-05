// github adapter shared helpers — public REST API at api.github.com.
//
// Unauthenticated rate limit: 60 requests/hour per IP. The adapter does not
// log in or set tokens; if rate-limited the user just sees a typed
// CommandExecutionError carrying the GitHub message + reset-time hint.
import {
    ArgumentError,
    AuthRequiredError,
    CommandExecutionError,
    EmptyResultError,
} from '@jackwener/opencli/errors';

export const GITHUB_API = 'https://api.github.com';

const UA = 'opencli-github-adapter (+https://github.com/jackwener/opencli)';

/** Validate `limit` per typed-fail-fast convention (no silent clamp). */
export function normalizeLimit(value, defaultValue, maxValue, label = 'limit') {
    const raw = value ?? defaultValue;
    const limit = Number(raw);
    if (!Number.isInteger(limit) || limit <= 0) {
        throw new ArgumentError(`${label} must be a positive integer`);
    }
    if (limit > maxValue) {
        throw new ArgumentError(`${label} must be <= ${maxValue}`);
    }
    return limit;
}

/** Validate enum-like string args (no silent fallback). */
export function normalizeEnum(value, allowed, defaultValue, label) {
    const raw = value == null || value === '' ? defaultValue : String(value).toLowerCase();
    if (!allowed.includes(raw)) {
        throw new ArgumentError(`${label} must be one of ${allowed.join(', ')}`);
    }
    return raw;
}

/**
 * Parse `owner/repo` style positional. Throws ArgumentError for malformed input.
 * Returns `{ owner, repo }`.
 */
export function parseOwnerRepo(value, label = 'repo') {
    const raw = String(value || '').trim();
    if (!raw) {
        throw new ArgumentError(`${label} cannot be empty`, 'Example: facebook/react');
    }
    const m = raw.match(/^([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}[A-Za-z0-9])?)\/([A-Za-z0-9._-]{1,100})$/);
    if (!m) {
        throw new ArgumentError(`${label} must look like owner/repo (got "${raw}")`, 'Example: facebook/react');
    }
    return { owner: m[1], repo: m[2] };
}

export function normalizeUsername(value, label = 'username') {
    const raw = String(value || '').trim().replace(/^@/, '');
    if (!raw) {
        throw new ArgumentError(`${label} cannot be empty`);
    }
    if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(raw)) {
        throw new ArgumentError(`${label} must be a valid GitHub login (got "${value}")`);
    }
    return raw;
}

/**
 * Fetch a github API endpoint and return parsed JSON.
 * Maps known status codes to typed errors; falls back to CommandExecutionError.
 */
export async function ghFetch(pathOrUrl, { searchParams } = {}) {
    const url = pathOrUrl.startsWith('http')
        ? new URL(pathOrUrl)
        : new URL(pathOrUrl, GITHUB_API);
    if (searchParams) {
        for (const [k, v] of Object.entries(searchParams)) {
            if (v == null || v === '') continue;
            url.searchParams.set(k, String(v));
        }
    }
    let resp;
    try {
        resp = await fetch(url, {
            headers: {
                'Accept': 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28',
                'User-Agent': UA,
            },
        });
    } catch (error) {
        throw new CommandExecutionError(`github request failed: ${error?.message || error}`);
    }
    if (resp.status === 401) {
        throw new AuthRequiredError('github.com', 'GitHub returned 401 (token rejected); this adapter is meant for unauthenticated use.');
    }
    if (resp.status === 403 || resp.status === 429) {
        let body = '';
        try { body = (await resp.json())?.message || ''; } catch { /* ignore */ }
        const reset = resp.headers.get('x-ratelimit-reset');
        const hint = reset
            ? ` (rate limit resets at ${new Date(Number(reset) * 1000).toISOString()})`
            : '';
        throw new CommandExecutionError(
            `github HTTP ${resp.status}: ${body || 'rate limit or forbidden'}${hint}`,
            'Unauthenticated GitHub API allows ~60 req/h per IP. Wait for the reset window.'
        );
    }
    if (resp.status === 404) {
        throw new EmptyResultError('github', `github resource not found: ${url.pathname}`);
    }
    if (!resp.ok) {
        let body = '';
        try { body = (await resp.json())?.message || ''; } catch { /* ignore */ }
        throw new CommandExecutionError(`github HTTP ${resp.status}: ${body || resp.statusText}`);
    }
    try {
        return await resp.json();
    } catch (error) {
        throw new CommandExecutionError(`github returned malformed JSON: ${error?.message || error}`);
    }
}

/** ISO date helper — coerce to YYYY-MM-DD or empty string. */
export function isoDate(value) {
    if (!value) return '';
    const s = String(value);
    return s.length >= 10 ? s.slice(0, 10) : s;
}

/** Strip null/undefined to a stable empty string for column display. */
export function asString(value) {
    if (value == null) return '';
    return String(value);
}
