import { joinSession } from "@github/copilot-sdk/extension";
import { execFile, exec } from "node:child_process";
import { basename } from "node:path";

// --- Helpers ---

function runCommand(cmd, args, timeout = 15000) {
    return new Promise((resolve) => {
        execFile(cmd, args, { timeout }, (err, stdout, stderr) => {
            if (err) resolve({ ok: false, output: stderr?.trim() || err.message });
            else resolve({ ok: true, output: stdout.trim() });
        });
    });
}

function runShell(command, timeout = 15000) {
    return new Promise((resolve) => {
        exec(command, { timeout }, (err, stdout, stderr) => {
            if (err) resolve({ ok: false, output: stderr?.trim() || err.message });
            else resolve({ ok: true, output: stdout.trim() });
        });
    });
}

// --- Dangerous command patterns ---

const DENY_PATTERNS = [
    /rm\s+-rf\s+\/($|\s|\*)/,        // rm -rf / or rm -rf /*
    /rm\s+-rf\s+\/\*/,
    /sudo\s+rm\s/,                     // sudo rm anything
    /chmod\s+-R\s+777/,                // chmod -R 777
    /git\s+push\s+--force(?!\s*-with-lease)\b/, // git push --force (but allow --force-with-lease)
    /curl\s+.*\|\s*(ba)?sh/,           // curl | bash or curl | sh
    /wget\s+.*\|\s*(ba)?sh/,           // wget | bash
];

// --- Resource check (ported from resource-check.sh) ---

async function checkResources() {
    const issues = [];

    // Check 1: Load average
    const load = await runShell("sysctl -n vm.loadavg 2>/dev/null | awk '{print $2}'");
    if (load.ok && load.output) {
        const loadVal = parseFloat(load.output);
        if (loadVal > 20) issues.push(`Load average: ${loadVal} (threshold: 20)`);
    }

    // Check 2: High-CPU processes (>80%, exclude superwhisper)
    const cpu = await runShell(
        "ps -arcwwxo pid,pcpu,etime,command 2>/dev/null | awk 'NR>1 && $2+0 > 80 && !/superwhisper/ {print $0}'"
    );
    if (cpu.ok && cpu.output) {
        for (const line of cpu.output.split("\n").filter(Boolean)) {
            issues.push(`High CPU: ${line.trim()}`);
        }
    }

    // Check 3: Hung Azure CLI (>30 min)
    const az = await runShell(
        `ps -eo pid,etime,command 2>/dev/null | grep -E 'azure\\.cli|az account' | grep -v grep | awk '{
            split($2, t, /[-:]/)
            if (length(t) == 4) mins = t[1]*24*60 + t[2]*60 + t[3]
            else if (length(t) == 3) mins = t[1]*60 + t[2]
            else mins = t[1]
            if (mins > 30) print $0
        }'`
    );
    if (az.ok && az.output) {
        for (const line of az.output.split("\n").filter(Boolean)) {
            issues.push(`Hung Azure CLI (>30min): ${line.trim()}`);
        }
    }

    // Check 4: Stale Docker containers (>4 hours)
    const docker = await runShell(
        "docker ps --format '{{.ID}}\\t{{.Image}}\\t{{.RunningFor}}\\t{{.Names}}' 2>/dev/null"
    );
    if (docker.ok && docker.output) {
        for (const line of docker.output.split("\n").filter(Boolean)) {
            const parts = line.split("\t");
            if (parts.length >= 3) {
                const runningFor = parts[2];
                if (/\d+\s+(day|week)|About an hour|[4-9] hours|\d{2,} hours/.test(runningFor)) {
                    issues.push(`Stale Docker (${runningFor}): ${parts[1]} [${parts[3] || ""}]`);
                }
            }
        }
    }

    // Check 5: Orphaned Python (>2h, ppid=1)
    const orphan = await runShell(
        `ps -eo pid,ppid,etime,command 2>/dev/null | grep -E 'Python|python' | grep -v grep | awk '$2 == 1 {
            split($3, t, /[-:]/)
            if (length(t) == 4) mins = t[1]*24*60 + t[2]*60 + t[3]
            else if (length(t) == 3) mins = t[1]*60 + t[2]
            else mins = t[1]
            if (mins > 120) print $0
        }'`
    );
    if (orphan.ok && orphan.output) {
        for (const line of orphan.output.split("\n").filter(Boolean)) {
            issues.push(`Orphaned Python (>2h): ${line.trim()}`);
        }
    }

    return issues;
}

// --- Session tracking for end-of-session logging ---

let turnCount = 0;
const sessionStartTime = Date.now();

// --- Main extension ---

const session = await joinSession({
    hooks: {
        // --- SessionStart: Resource check ---
        onSessionStart: async (input) => {
            await session.log("session-lifecycle extension active");
            turnCount = 0;

            const issues = await checkResources();

            if (issues.length === 0) {
                return undefined; // suppress — all clear
            }

            const msg = [
                `RESOURCE ALERT: ${issues.length} issue(s) detected at session start.`,
                "",
                ...issues.map((i) => `- ${i}`),
                "",
                "Review and confirm before taking any cleanup action.",
            ].join("\n");

            await session.log(`Resource check: ${issues.length} issue(s)`, { level: "warning" });
            return { additionalContext: msg };
        },

        // --- PreToolUse: Security guard ---
        onPreToolUse: async (input) => {
            if (input.toolName === "bash") {
                const cmd = String(input.toolArgs?.command || "");
                for (const pattern of DENY_PATTERNS) {
                    if (pattern.test(cmd)) {
                        await session.log(`Blocked dangerous command: ${cmd.slice(0, 80)}`, { level: "error" });
                        return {
                            permissionDecision: "deny",
                            permissionDecisionReason: `Blocked by session-lifecycle security guard: matches ${pattern}`,
                        };
                    }
                }
            }
            // Allow everything else
            return { permissionDecision: "allow" };
        },

        // --- PostToolUse: Python lint reminder ---
        onPostToolUse: async (input) => {
            if (input.toolName === "edit" || input.toolName === "create") {
                const filePath = String(input.toolArgs?.path || "");
                if (filePath.endsWith(".py")) {
                    return {
                        additionalContext:
                            "Python file modified. For vuln-agg repos, both `ruff check` AND `ruff format --check` must pass.",
                    };
                }
            }
            return undefined;
        },

        // --- SessionEnd: Obsidian logging + QMD reindex ---
        onSessionEnd: async (input) => {
            // Skip aborts and trivial sessions
            if (input.reason === "abort") return undefined;

            const elapsed = (Date.now() - sessionStartTime) / 1000;
            if (turnCount < 3 && elapsed < 120) return undefined;

            const repoName = basename(input.cwd || process.cwd());
            const summary = input.finalMessage
                ? input.finalMessage.slice(0, 200)
                : `Session in ${repoName} (${input.reason})`;

            // Log to Obsidian
            const logScript =
                "/Users/sophiagavrila/Documents/Obsidian Vault/02 - Agent Sessions/log-session.sh";
            const logResult = await runCommand(logScript, ["Copilot", summary, repoName], 30000);
            if (!logResult.ok) {
                await session.log(`Session log failed: ${logResult.output}`, { level: "warning" });
            }

            // QMD reindex (fire and forget — don't block shutdown)
            exec("/opt/homebrew/bin/qmd update", { timeout: 60000 }, () => {});

            return {
                sessionSummary: summary,
                cleanupActions: ["Logged to Obsidian", "QMD reindex started"],
            };
        },

        // --- ErrorOccurred: Retry model calls ---
        onErrorOccurred: async (input) => {
            if (input.recoverable && input.errorContext === "model_call") {
                await session.log("Model call failed, retrying...", { level: "warning", ephemeral: true });
                return { errorHandling: "retry", retryCount: 2 };
            }
            return undefined;
        },
    },
    tools: [],
});

// Track turns for session-end gating
session.on("user.message", () => {
    turnCount++;
});
