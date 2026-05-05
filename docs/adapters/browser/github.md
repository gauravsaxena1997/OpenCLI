# GitHub

Access **GitHub** public repository, user, and release data from the terminal via the unauthenticated REST API at `api.github.com`.

**Mode**: 🌐 Public · **Domain**: `github.com`

## Commands

| Command | Description |
|---------|-------------|
| `opencli github user` | Public user profile (followers, repo counts, bio, dates) |
| `opencli github user-repos` | List public repositories owned by a user |
| `opencli github repo` | Single repository metadata (stars, forks, license, dates) |
| `opencli github search-repos` | Search public repositories |
| `opencli github releases` | List a repository's releases (newest first) |

## Usage Examples

```bash
# Profile snapshot
opencli github user octocat

# Top 30 most-recently-updated repos owned by a user
opencli github user-repos torvalds --limit 30

# Repository detail
opencli github repo facebook/react

# Search repositories with GitHub search syntax
opencli github search-repos "agentic browser language:typescript" --limit 20

# Search with explicit sort/order
opencli github search-repos "react native" --sort forks --order desc --limit 10

# Releases for a repository
opencli github releases nodejs/node --limit 10
```

## Options

### `user`

| Option | Description |
|--------|-------------|
| `username` (positional) | GitHub login, with or without leading `@` |

### `user-repos`

| Option | Description |
|--------|-------------|
| `username` (positional) | GitHub login |
| `--sort` | `updated` / `created` / `pushed` / `full_name` (default: `updated`) |
| `--type` | `all` / `owner` / `member` (default: `owner`) |
| `--limit` | Max repos (1–100, default: 30) |

### `repo`

| Option | Description |
|--------|-------------|
| `repo` (positional) | `owner/repo` (e.g. `facebook/react`) |

### `search-repos`

| Option | Description |
|--------|-------------|
| `query` (positional) | Search query (supports GitHub search syntax) |
| `--sort` | `stars` / `forks` / `updated` / `help-wanted-issues` (default: `stars`) |
| `--order` | `desc` / `asc` (default: `desc`) |
| `--limit` | Max repos (1–100, default: 20) |

### `releases`

| Option | Description |
|--------|-------------|
| `repo` (positional) | `owner/repo` |
| `--limit` | Max releases (1–100, default: 20) |

## Prerequisites

- No browser required — uses the public GitHub REST API
- No authentication needed for these endpoints; the unauthenticated rate limit is **60 requests/hour per IP**

## Notes

- All five commands are read-only (`access: 'read'`) and never modify GitHub state
- The `repo` and `user-repos` commands return only public repositories; private repos require an authenticated token (not supported by this adapter)
- `--limit` is validated upfront and rejected with `ArgumentError` if non-positive or above the API's `per_page` ceiling (100) — no silent clamp
- Hitting the unauthenticated rate limit returns a typed `CommandExecutionError` carrying the GitHub message and the reset window from `x-ratelimit-reset`
- `repo` reports `stars` from `stargazers_count` and `watchers` from `subscribers_count` (true subscribers, not stargazers — GitHub's REST API conflates them under `watchers_count` for legacy reasons)
- `releases` excludes nothing — `prerelease` and `draft` are surfaced as boolean columns instead of being filtered, so the caller decides
