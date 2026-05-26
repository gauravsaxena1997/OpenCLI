# Naukri

**Mode**: 🍪 Browser (cookie) · **Domain**: `www.naukri.com`

[Naukri](https://www.naukri.com/) is one of India's largest job-search and
recruiting platforms. The adapter drives the logged-in candidate profile pages
through a browser session so users can inspect and maintain recruiter-facing
profile fields.

## Commands

| Command | Description |
|---------|-------------|
| `opencli naukri profile-read` | Read visible Naukri candidate profile sections |
| `opencli naukri resume-upload <file>` | Upload a resume file and verify the saved filename |
| `opencli naukri headline-set --text <text>` | Update the resume headline and verify readback |
| `opencli naukri summary-set --text <text>` | Update the profile summary and verify readback |
| `opencli naukri key-skills-list` | List current key-skill chips |
| `opencli naukri key-skills-suggest --query <query>` | Inspect key-skill autocomplete suggestions without saving |
| `opencli naukri key-skills-resolve --skills <skills>` | Resolve desired key-skill labels against Naukri suggestions |
| `opencli naukri key-skills-set --skills <skills>` | Replace key skills and verify the final saved chips |
| `opencli naukri it-skills-list` | List current IT-skill rows |
| `opencli naukri it-skills-resolve --skills <skills>` | Resolve IT-skill labels against Naukri suggestions |
| `opencli naukri it-skills-upsert --skill <skill> --last-used <year>` | Create or update one IT-skill row |
| `opencli naukri it-skills-delete --skill <skill>` | Delete one IT-skill row |
| `opencli naukri it-skills-set --items <json>` | Replace IT-skill rows from a JSON array |
| `opencli naukri employment-list` | List visible employment entries |
| `opencli naukri employment-end --company <company>` | Mark an employment entry as previous employment |
| `opencli naukri employment-add-current --title <title> --company <company>` | Add a current employment entry |
| `opencli naukri projects-list` | List visible project entries |
| `opencli naukri projects-options --match-title <title>` | Inspect live project modal dropdown options and skill suggestions |
| `opencli naukri projects-add --title <title> --client <client>` | Add a project entry |
| `opencli naukri projects-update --match-title <title>` | Update optional project fields using live dropdown/autocomplete resolution |

## Usage Examples

```bash
# Read the logged-in profile
opencli naukri profile-read -f json

# Upload a resume file
opencli naukri resume-upload ~/Downloads/resume.pdf -f json

# Update profile text fields
opencli naukri headline-set --text "Senior Full-Stack AI Engineer | React, Node.js, TypeScript"
opencli naukri summary-set --text "Senior full-stack engineer focused on AI products and automation."

# Inspect and update key skills
opencli naukri key-skills-list -f json
opencli naukri key-skills-suggest --query "React" -f json
opencli naukri key-skills-resolve --skills "React, TypeScript, Node.js" -f json
opencli naukri key-skills-set --skills "React.js, TypeScript, Node.js" -f json

# Inspect and update IT skills
opencli naukri it-skills-list -f json
opencli naukri it-skills-resolve --skills "React.js, TypeScript, Agentic Ai" -f json
opencli naukri it-skills-upsert --skill "TypeScript" --version "5" --last-used 2026 --years 4 --months 0 -f json
opencli naukri it-skills-delete --skill "Angular" -f json
opencli naukri it-skills-set --items '[{"skill":"Node.js","version":"20","last_used":"2026","years":6,"months":6}]' -f json

# Employment entries
opencli naukri employment-list -f json
opencli naukri employment-end --company "Example Corp" --end-year 2025 --end-month Feb -f json
opencli naukri employment-add-current \
  --title "Senior Full-Stack AI Engineer" \
  --company "Self Employed" \
  --start-year 2025 \
  --start-month Mar \
  --skills "React.js, TypeScript, Node.js" \
  --description "Building full-stack AI products and automation systems." \
  -f json

# Project entries
opencli naukri projects-list -f json
opencli naukri projects-options --match-title "OpenCLI Naukri Adapter" --skill-query "React" -f json
opencli naukri projects-add \
  --title "OpenCLI Naukri Adapter" \
  --client "OpenCLI" \
  --status "in progress" \
  --start-year 2026 \
  --start-month May \
  --details "Built a Naukri adapter for OpenCLI profile automation." \
  -f json
opencli naukri projects-update \
  --match-title "OpenCLI Naukri Adapter" \
  --tag "Senior Full-Stack AI Engineer - Self Employed" \
  --location-mode offsite \
  --location Remote \
  --nature contractual \
  --role Programmer \
  --details "Live: https://example.com. Built a Naukri adapter for OpenCLI profile automation." \
  --skills "React.js, TypeScript, Node.js" \
  -f json
```

## Output Columns

| Command | Columns |
|---------|---------|
| `profile-read` | `profile_url, name, current_title, current_company, profile_last_updated, profile_completion, photo_status, location, total_experience, current_salary, phone, email, notice_status, resume_file, resume_uploaded_on, resume_headline, key_skills, employment, education, it_skills, projects, profile_summary, accomplishments, career_profile, personal_details, diversity_inclusion` |
| `resume-upload` | `status, resume_file, resume_uploaded_on` |
| `headline-set` | `status, resume_headline` |
| `summary-set` | `status, profile_summary` |
| `key-skills-list` | `rank, skill` |
| `key-skills-suggest` | `rank, suggestion, source, endpoint` |
| `key-skills-resolve` | `input, resolved, status, confidence, alternatives` |
| `key-skills-set` | `status, skills, missing, extra` |
| `it-skills-list` | `rank, id, skill, version, last_used, experience_years, experience_months` |
| `it-skills-resolve` | `input, resolved, status, confidence, alternatives` |
| `it-skills-upsert` | `status, skill, version, last_used, experience_years, experience_months` |
| `it-skills-delete` | `status, skill` |
| `it-skills-set` | `status, skills, missing, extra` |
| `employment-list` | `rank, id, title, company, text` |
| `employment-end` | `status, company, worked_till` |
| `employment-add-current` | `status, title, company` |
| `projects-list` | `rank, title, text` |
| `projects-options` | `kind, id, current, value, label` |
| `projects-add` | `status, title` |
| `projects-update` | `status, title, role, skills` |

## Args

### `resume-upload`

| Arg | Type | Default | Notes |
|-----|------|---------|-------|
| `file` *(positional, required)* | string | — | Resume file path. Supported formats: `.doc`, `.docx`, `.rtf`, `.pdf`; max 2 MB |

### `headline-set`

| Arg | Type | Default | Notes |
|-----|------|---------|-------|
| `--text` | string | — | New resume headline |

### `summary-set`

| Arg | Type | Default | Notes |
|-----|------|---------|-------|
| `--text` | string | — | New profile summary |

### `key-skills-suggest`

| Arg | Type | Default | Notes |
|-----|------|---------|-------|
| `--query` | string | — | Skill prefix to type into the Naukri autocomplete |
| `--limit` | int | `10` | Max suggestions to return, 1-25 |

### `key-skills-resolve`

| Arg | Type | Default | Notes |
|-----|------|---------|-------|
| `--skills` | string | — | Comma, semicolon, or newline separated desired skill labels |
| `--limit` | int | `8` | Max suggestions to inspect per skill, 1-15 |

### `key-skills-set`

| Arg | Type | Default | Notes |
|-----|------|---------|-------|
| `--skills` | string | — | Comma, semicolon, or newline separated final Naukri key skill labels |

### `it-skills-resolve`

| Arg | Type | Default | Notes |
|-----|------|---------|-------|
| `--skills` | string | — | Comma, semicolon, or newline separated IT skill labels |
| `--limit` | int | `8` | Max suggestions to inspect per skill, 1-15 |

### `it-skills-upsert`

| Arg | Type | Default | Notes |
|-----|------|---------|-------|
| `--skill` | string | — | IT skill/software label |
| `--match-skill` | string | `""` | Existing row label to edit instead of matching `--skill` |
| `--version` | string | `""` | Optional software version |
| `--last-used` | string | — | Last-used year |
| `--years` | int | `0` | Experience years |
| `--months` | int | `0` | Experience months, 0-11 |

### `it-skills-delete`

| Arg | Type | Default | Notes |
|-----|------|---------|-------|
| `--skill` | string | — | Exact IT skill/software label to delete |

### `it-skills-set`

| Arg | Type | Default | Notes |
|-----|------|---------|-------|
| `--items` | string | — | JSON array of `{skill, version, last_used, years, months}` objects; max 10 rows |

### `employment-end`

| Arg | Type | Default | Notes |
|-----|------|---------|-------|
| `--company` | string | — | Company-name substring to update |
| `--end-year` | string | — | Worked-till year |
| `--end-month` | string | — | Worked-till month number or name |

### `employment-add-current`

| Arg | Type | Default | Notes |
|-----|------|---------|-------|
| `--title` | string | — | Current job title |
| `--company` | string | — | Current company name |
| `--start-year` | string | — | Joining year |
| `--start-month` | string | — | Joining month number or name |
| `--total-years` | int | `6` | Total profile experience years |
| `--total-months` | int | `6` | Total profile experience months |
| `--salary` | string | `25,00,000` | Current salary amount without currency symbol |
| `--notice-period` | string | `1` | Naukri notice period id; `1` is 15 days or less |
| `--skills` | string | — | Comma-separated top skills used; first five are used |
| `--description` | string | — | Job profile description |

### `projects-add`

| Arg | Type | Default | Notes |
|-----|------|---------|-------|
| `--title` | string | — | Project title |
| `--client` | string | — | Client name |
| `--status` | string | `finished` | `finished` or `in progress` |
| `--start-year` | string | — | Project start year |
| `--start-month` | string | — | Project start month number or name |
| `--end-year` | string | — | Required for finished projects |
| `--end-month` | string | — | Required for finished projects; month number or name |
| `--details` | string | — | Project details text |

### `projects-options`

| Arg | Type | Default | Notes |
|-----|------|---------|-------|
| `--match-title` | string | — | Existing project title to inspect; opens add modal when omitted |
| `--skill-query` | string | — | Optional skill query to inspect project-skill suggestions |
| `--limit` | int | `20` | Max options or suggestions to return, 1-50 |

### `projects-update`

| Arg | Type | Default | Notes |
|-----|------|---------|-------|
| `--match-title` | string | — | Existing project title to update |
| `--tag` | string | — | Employment or education label, resolved from the live dropdown |
| `--location` | string | — | Project location text |
| `--location-mode` | string | — | `offsite`, `onsite`, or `remote`; `remote` maps to `offsite` |
| `--nature` | string | — | `full-time`, `part-time`, or `contractual` |
| `--team-size` | string | — | Team-size dropdown label |
| `--role` | string | — | Role label, resolved from the live role dropdown |
| `--role-description` | string | — | Role description text |
| `--details` | string | — | Project details text |
| `--skills` | string | — | Comma-separated skills resolved from the project-skill autocomplete |

## Prerequisites

The adapter uses the connected browser profile and `Strategy.COOKIE`. Sign in to
Naukri in the connected browser before running these commands. If the session is
not authenticated, open `https://www.naukri.com/`, sign in, and retry.

## Limitations

- The adapter targets the candidate profile pages on `www.naukri.com`.
- Write commands interact with the rendered profile UI, so selector changes or
  A/B-tested profile modals may require adapter updates.
- Key-skill writes are limited by Naukri's own allowed labels and profile skill
  count. Use `key-skills-suggest` or `key-skills-resolve` before replacing the
  saved key-skill list.
- IT skills are limited by Naukri's profile UI to 10 rows. `it-skills-set`
  rejects larger replacement lists before opening the browser, and
  `it-skills-upsert` rejects creating a new row when the profile is already at
  the limit unless `--match-skill` is used to edit an existing row.
- Some Naukri dropdowns are custom rendered controls. Commands verify saved
  profile text after writes where possible, but Naukri UI changes can affect
  dropdown persistence.
- Project role and project-skill fields are resolved at runtime from Naukri's
  live dropdown/autocomplete options. Use `projects-options` before
  `projects-update` when choosing labels for a profile.
