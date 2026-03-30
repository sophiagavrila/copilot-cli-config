# Global Copilot CLI Instructions

## User Identity & Preferences
- **Branch naming**: Always use `sophiagavrila/` prefix (NOT `sgavrila/`)
- **Sign commits** with `-S` (SSH signing configured globally)
- Keep tone flat, no hype, **no exclamation points**
- **NEVER propose timeframes**, schedules, or "this week / next week" planning
- Prioritize speed over verbose explanation
- When context is sufficient, **skip clarifying questions** and just act
- Only ask if an action is destructive and irreversible
- When one option is clearly best, **execute it** — don't ask the user to pick
- Produce artifacts first, skip verbal descriptions — the user judges with their eyes
- Format URLs as clickable markdown links
- Don't ask permission to commit/push when user already asked to do something
- When told to look at the screen, immediately run `screencapture -D 2 /tmp/copilot-screenshot.png` and inspect it

## Code Change Discipline
- **One change at a time**, test, then proceed (incremental changes)
- `cp file file.bak` before first config edit (backup before editing)
- **Never deploy config changes without explicit approval**
- PRs must include a section on what is NOT touched (isolation section)
- When debugging pipelines: curl first, short dev loops, isolate single queries
- When a local pipeline is requested, run the real code path — not a simulation
- For visual/design work, generate artifacts immediately instead of describing them

## PR Review Rules
- Validate every finding against actual source — trace exact code paths
- Drop any finding you cannot prove with line numbers
- Use COMMENT mode with suggestion blocks where applicable
- Approve minor PRs with inline suggestions instead of blocking COMMENT-only
- Verify compile-safety before posting review comments

## Git Patterns
- Rebase frequently on long-lived branches
- `git config http.postBuffer 524288000` for large pushes
- Stack PRs under Deployable ruleset to avoid restamps
- `git push --force-with-lease` (NEVER `--force`)
- Before merging, check for deploy locks

## Build & Test Commands (Key Repos)

### vulnerability-aggregator (Django/Python)
```bash
./script/bootstrap && ./script/run_local_instance
./script/test "not acceptance"    # unit tests (100% coverage required)
./script/test "acceptance"        # integration tests
./script/pdb -k {test_name}      # debug single test
./script/lint                     # ruff check + ruff format --check (BOTH must pass)
./script/migrate && ./script/migrations_check
./script/update_api_schema        # regenerate GraphQL schema
```

### wiz-therapy (Python/uv)
```bash
DEV_FLAG=True ./script/bootstrap
uv run python main.py -c --local-storage --single-iteration
```

### Go repos (sbom-kustodian, sbom-repo-ingestor, etc.)
```bash
go mod tidy && go mod vendor    # after dependency changes
go test ./...                   # run all tests
go vet ./...                    # static analysis
```

## Python Conventions
- `from __future__ import annotations` at top of every file
- Conditional imports under `TYPE_CHECKING`
- Logging: `@annotate_logs()` decorator, structured JSON, never f-strings in log messages
- Testing: pytest, factories over shared fixtures, `@pytest.mark.django_db`
- Package manager: `uv` (newer repos) or `pip`
- Lint: both `ruff check` AND `ruff format --check` must pass

## Go Conventions
- Standard layout with `cmd/` and `internal/`
- `go mod vendor` — repos use vendored dependencies
- After vendor changes: `go mod tidy && go mod vendor`, commit ALL zips
- `git ls-tree` always returns exit 0 — check output, not exit code

## Architecture: Security Findings Pipeline
```
Grype/Wiz/Tenable/GHAS → Workers → Aqueduct queues → vulnerability-aggregator → vuln-notifier → GitHub Issues
```
- All findings enter via **GraphQL mutations**, not REST
- Workers follow **Fetch → Process → Send** pattern
- Intermediate data stored in **Azure Blob Storage** via `blobbr`
- Routing keys must be **deterministic** — changes break notification tracking
- Filter order matters for performance in wiz-therapy — broader filters first

## Key Endpoints
- Staging: `https://security-findings-staging.githubapp.com/`
- Wiz API: OAuth token → read JWT `dc` claim → `https://api.{dc}.app.wiz.io/graphql`
- GitHub Models API: `https://models.github.ai/inference/chat/completions` (use `curl`, NOT `gh api`)
- Kusto: `dec-sboms-prod.eastus.kusto.windows.net` (sboms), `dec-secfin-kusto-prod.eastus.kusto.windows.net` (secfin)

## Agent Instruction Files
| File | Agent |
|------|-------|
| `AGENTS.md` | OpenAI Codex |
| `CLAUDE.md` | Claude Code |
| `.github/copilot-instructions.md` | GitHub Copilot |

Always read a repo's own instruction file before working in it.

## Moda Investigation Workflow
1. `search_apps` → find exact app name
2. `get_last_deployment` → check status
3. `get_deployment_logs` → check for errors
4. `get_pipeline_runs` → see which PRs were included
5. For redeploys: `.pipeline retry deploy`, not empty commits

## Session Logging
At the end of every significant task, log a session summary:
```bash
"/Users/sophiagavrila/Documents/Obsidian Vault/02 - Agent Sessions/log-session.sh" \
  "Copilot" "Brief description of what was done" repo-name
```

## Weekly Snippets Format
- Lead TL;DR with strategic narrative, not ship list
- Structure: TL;DR → Accomplishments & Metrics → Up Next → PR Highlights
- Omit empty blocker sections; keep Up Next short
- Use conversational language emphasizing why work matters
- Include only this week's PRs; avoid routine maintenance noise

## Lessons & Gotchas
- `gh api --paginate` with `--jq` produces multiple arrays — pipe through standalone `jq`
- `github.base_ref` is empty on `merge_group` events — make conditional
- `git diff` misses untracked files — use `git status --porcelain` for vendor checks
- YAML heredoc content must stay at block scalar indentation level
- `pipefail` gotcha: `grep | sort | tail || echo "0"` — sort/tail exit 0 on empty input
- Shell injection: never interpolate model output into shell strings — use `--body-file`
- `lock_branch` blocks ALL merges even with CI passing — check via API
- Pin `golangci-lint` to full semver in blocking CI
