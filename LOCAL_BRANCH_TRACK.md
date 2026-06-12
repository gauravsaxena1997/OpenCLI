# Local Branch Track

This file tracks the intended active OpenCLI branch set for the local fork workflow.

## Active Branches

### Open PR branches

- `feat/linkedin-enhancements`
  - Upstream PR: `#1930`
  - Scope: LinkedIn safe-send multiline preservation and public job-detail description fallback

- `feat/twitter-enhancements`
  - Upstream PR: `#1931`
  - Scope: Twitter scheduled posts and quote-composer fallback

- `feat/opencli-instagram-user-full-urls`
  - Upstream PR: `#1928`
  - Scope: Instagram detail command, date filters, canonical/direct URLs

- `feat/wellfound-adapter`
  - Upstream PR: `#1819`
  - Scope: Wellfound browser adapter

- `feat/naukri-profile-read`
  - Upstream PR: `#1756`
  - Scope: original Naukri profile read/write line

### Fork-kept local branches

- `feat/naukri-enhancements`
  - Scope: consolidated Naukri enhancement line kept on the fork

- `feat/naukri-rendered-job-detail-fallback`
  - Scope: Naukri rendered job-detail fallback side branch not yet folded into another published line

### Local integration branch

- `local/career-os-opencli-root`
  - Scope: local integration branch for combining validated fork work
  - Planned rename: `local/root`

## Intended Steady State

- One LinkedIn branch
- One Twitter branch
- One Instagram branch
- One Wellfound branch
- Two Naukri branches
- One local integration root branch

## Pending Root Rename

When the branch layout is stable:

1. Create `local/root` from `local/career-os-opencli-root`
2. Update the OpenCLI local skill and any VPS/local sync docs that reference the old name
3. Deprecate `local/career-os-opencli-root`
