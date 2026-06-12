# Local Root README

This file tracks the active OpenCLI branch set for the local fork workflow and the purpose of the `local/root` integration branch.

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

- `local/root`
  - Scope: local integration branch for combining validated fork work

## Intended Steady State

- One LinkedIn branch
- One Twitter branch
- One Instagram branch
- One Wellfound branch
- Two Naukri branches
- One local integration root branch

## Current Local Root Workflow

1. Keep feature and PR-ready work on narrow branches.
2. Merge validated branch heads into `local/root`.
3. Use `local/root` as the local SSOT branch for Mac and VPS sync.

## Active Branches Right Now

- `feat/linkedin-enhancements`
- `feat/twitter-enhancements`
- `feat/opencli-instagram-user-full-urls`
- `feat/wellfound-adapter`
- `feat/naukri-enhancements`
- `feat/naukri-profile-read`
- `local/root`
