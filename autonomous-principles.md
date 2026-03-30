# Humans at the Edges: Principles for 100% Autonomous Development

> Distilled from Anthropic's published research on agent autonomy, context engineering, and safe long-running agents -- combined with hard-won patterns from real production usage.

---

## The Spectrum: Three Stages of AI Work

| Stage | Name | Flow | Your Role |
|-------|------|------|-----------|
| 1 | **Vibe Coding** | Human prompts -> AI writes -> Human reviews | Writer |
| 2 | **Agentic Engineering** | Human orchestrates -> Agents execute -> Human directs | Director |
| 3 | **Independent Research** | Human sets goal -> Agent runs autonomously -> Human reviews results | Principal Investigator |

The goal: move right without losing control.

---

## The 12 Principles

### 01. Verification Is the Highest-Leverage Investment
Give agents tests, screenshots, linters, or scripts to self-check. Without verification, **you** are the only feedback loop. This is the single most important thing you can do.

> *Source: Anthropic -- Best Practices for Claude Code*

### 02. Context Is the Fundamental Constraint
LLM performance degrades as the context window fills. Manage it aggressively: `/clear` between tasks, subagents for exploration, compact when needed, structured notes outside the window.

> *Source: Anthropic -- Effective Context Engineering for AI Agents*

### 03. Explore, Plan, Then Implement
Separate research and planning from execution to avoid solving the wrong problem. Planning is most valuable when the change modifies multiple files or when you're unfamiliar with the code.

> *Source: Anthropic -- Best Practices for Claude Code*

### 04. CLAUDE.md Is Code, Not Documentation
Under 200 lines. Remove anything the agent infers by reading code. Include only what would cause mistakes if missing. Review it when things go wrong. This file achieves ~45x compression ratio of your workspace.

> *Source: Advanced Claude Code Reference -- Section 1*

### 05. The Infinity Loop: Build, Learn, Compress
Two loops compound: the **local loop** (plan -> build -> learn -> update CLAUDE.md) shaves ~10% per cycle. The **global loop** (`/insights` -> review -> distill) improves all future projects.

> *Source: Advanced Claude Code Reference -- Section 3*

### 06. The Harness Is Your Last Line of Defense
LLMs are text-in, text-out. The harness (permissions, hooks, deny rules) is what prevents catastrophe. Real example: an agent bypassed shell policy by rewriting `rm -rf` in Python.

> *Source: Advanced Claude Code Reference -- Section 4*

### 07. Trust Builds Progressively
New users approve 20% automatically. Experienced users approve 40%+. The shift is from action-by-action approval to **monitoring-based oversight**. Auto mode and sandboxing enable this safely.

> *Source: Anthropic -- Measuring Agent Autonomy in Practice*

### 08. Agents Should Self-Limit
Claude asks clarification questions more often than humans interrupt it. Self-initiated oversight is a critical safety property. The best agents recognize uncertainty rather than blindly attempting everything.

> *Source: Anthropic -- Measuring Agent Autonomy in Practice*

### 09. Git Commits + Progress Files + Init Scripts
The harness pattern for long-running agents. `init.sh` prevents wasted startup time. `progress.txt` maintains state across sessions. Git commits create natural checkpoints. This prevents all four common failure modes.

> *Source: Anthropic -- Effective Harnesses for Long-Running Agents*

### 10. Writer/Reviewer Separation
A fresh agent with no authoring context catches bugs the builder never will. Spawn QA as a separate session -- no shared context, no authoring bias. Iterate until zero issues returned.

> *Source: Advanced Claude Code Reference -- Section 7*

### 11. Parallelize for Quality, Not Just Speed
Shorter contexts per agent = better output. Three runs of the same prompt yield ~2.5x unique answers. Fan-out with cheap models for research, synthesize with Opus. 40% time savings is just the beginning.

> *Source: Advanced Claude Code Reference -- Section 5*

### 12. Human Role: Orchestration, Not Implementation
The goal isn't to remove humans from the loop -- it's to make human expertise count where it matters most. Define problems worth solving. Let AI handle tactical implementation. You review, direct, validate.

> *Source: Anthropic -- 2026 Agentic Coding Trends Report*

---

## Three Agent Patterns That Work

### Fan-Out / Fan-In
Spawn N research agents (Sonnet, cheap). Each investigates independently. Synthesize with Opus.
Best for: research, API discovery, competitor analysis.

```
N x Sonnet -> 1 x Opus synthesis
```

### Stochastic Consensus
Same prompt to N agents. Aggregate by frequency. High frequency = consensus. Low frequency = novel ideas.

```
mode(Agent_A, Agent_B, Agent_C) = confidence score
```

### Pipeline Handoff
Agent A (dev) -> Agent B (QA) -> Agent C (review). Fresh context per stage.
Best for: build-test-review cycles.

```
dev -> qa -> review (each with clean context)
```

---

## Auto-Research: 1,440 Experiments/Day

Based on Andrej Karpathy's approach.

```
Hypothesize -> Execute Change -> Assess -> Keep or Revert -> Log -> Repeat
```

Three requirements:
1. **Metric** -- A clear number to optimize (e.g., Lighthouse score, test pass rate)
2. **Change Method** -- A way to influence the metric (e.g., code changes). ~30 seconds.
3. **Assessment** -- A fast way to evaluate (e.g., run tests). ~30 seconds.

At 30s change + 30s assessment = 1 experiment/minute = **1,440 experiments/day**.
At 2% success rate with 1% improvement each: `1.01^30 = 34% improvement/day`.

> Shopify CEO Tobi Lutke ran auto-research on Liquid: **53% faster** parse+render, **61% fewer** object allocations.

---

## Five Failure Modes to Avoid

| Failure Mode | Symptom | Fix |
|-------------|---------|-----|
| **Kitchen Sink Session** | Mixing unrelated tasks, context full of noise | `/clear` between tasks |
| **Correction Spiral** | Repeatedly fixing the same thing, context polluted | After 2 corrections, `/clear` and rewrite prompt |
| **Over-Specified CLAUDE.md** | Agent ignores rules (too many compete for tokens) | Prune to under 200 lines |
| **Premature Victory** | Agent says "done" without testing | 200+ testable feature checklist |
| **Infinite Exploration** | Unscoped "investigate" fills context | Scope narrowly or use subagents |

---

## Bootstrap Prompt

Paste this into any AI coding agent (Claude Code, Copilot CLI, Codex) to set up the full harness:

```
I want to set up a fully autonomous development harness on this repo.
Follow these principles from Anthropic's research:

## Step 1: Foundation
Run /init (or create a CLAUDE.md / copilot-instructions.md / AGENTS.md).
Then audit it:
- Remove any rule the agent would follow by default
- Add a "Capabilities" section listing every tool, MCP server, and API available
- Add a "Lab Notes" section for logging failures and successes
- Keep it under 200 lines. Move extras to rules/ files
- Add build/test/lint commands with exact syntax

## Step 2: Verification Layer
Set up self-checking so I'm not the only feedback loop:
- Create a test suite the agent can run after every change
- Add a PostToolUse hook that auto-lints after file edits
- Add a PreToolUse hook that blocks: rm -rf, sudo rm, curl|bash,
  chmod 777, git push --force, DROP TABLE, DELETE FROM
- Create a progress.md file the agent updates after each feature
- Create an init.sh that boots the dev server + runs smoke tests

## Step 3: Session Hygiene
Add these conventions to the instructions file:
- /clear between unrelated tasks (don't let context rot)
- Use subagents for research (keep main context clean)
- After 2 failed corrections, /clear and rewrite the prompt
- Git commit after every working feature (natural checkpoints)
- Update progress.md before ending any session

## Step 4: Agent Separation
Set up the Writer/Reviewer pattern:
- After implementing a feature, spawn a fresh QA agent
- QA agent gets ONLY the changed files, no authoring context
- QA instructions: "Read this cold. List every bug, logic error,
  edge case, and missed requirement. Be adversarial."
- Iterate until QA returns zero issues

## Step 5: The Learning Loop
Add a meta-rule to the instructions file:
"When you make a mistake, update Lab Notes with what not to try
next time. When you succeed at something non-obvious, log the
approach. Periodically run /insights and distill patterns into
the instructions file."

Show me the final instructions file and all created configs
before committing anything. I'll review once, then you're autonomous.
```

---

## Sources

1. [Best Practices for Claude Code](https://code.claude.com/docs/en/best-practices)
2. [Measuring AI Agent Autonomy in Practice](https://www.anthropic.com/research/measuring-agent-autonomy)
3. [Framework for Safe and Trustworthy Agents](https://www.anthropic.com/news/our-framework-for-developing-safe-and-trustworthy-agents)
4. [Claude Code Auto Mode](https://www.anthropic.com/engineering/claude-code-auto-mode)
5. [Effective Harnesses for Long-Running Agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
6. [Effective Context Engineering for AI Agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
7. [Building Effective Agents](https://www.anthropic.com/research/building-effective-agents)
8. [2026 Agentic Coding Trends Report](https://resources.anthropic.com/hubfs/2026%20Agentic%20Coding%20Trends%20Report.pdf)
9. Advanced Claude Code Reference (3-hour course notes)
