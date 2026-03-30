import { joinSession } from "@github/copilot-sdk/extension";
import { execFile } from "node:child_process";
import { basename } from "node:path";

function run(cmd, args, options = {}) {
    return new Promise((resolve) => {
        execFile(cmd, args, { timeout: 30_000, ...options }, (err, stdout, stderr) => {
            if (err) resolve(`Error: ${stderr?.trim() || err.message}`);
            else resolve(stdout.trim() || "(no output)");
        });
    });
}

const cwd = process.cwd();

const session = await joinSession({
    tools: [
        {
            name: "log_session",
            description:
                "Log a session summary to the Obsidian vault. Runs the log-session.sh script for Copilot.",
            parameters: {
                type: "object",
                properties: {
                    summary: {
                        type: "string",
                        description: "Brief description of what was done",
                    },
                    repo: {
                        type: "string",
                        description:
                            "Repository name (defaults to basename of cwd)",
                    },
                },
                required: ["summary"],
            },
            handler: async (args) => {
                const repo = args.repo || basename(cwd);
                return run(
                    "/Users/sophiagavrila/Documents/Obsidian Vault/02 - Agent Sessions/log-session.sh",
                    ["Copilot", args.summary, repo],
                );
            },
        },
        {
            name: "qmd_search",
            description:
                "Search the QMD code index across workspace repos or a specific collection.",
            parameters: {
                type: "object",
                properties: {
                    query: {
                        type: "string",
                        description: "Search query string",
                    },
                    collection: {
                        type: "string",
                        description:
                            "Optional collection to search (e.g. 'second-brain')",
                    },
                },
                required: ["query"],
            },
            handler: async (args) => {
                const shellArgs = ["-c",
                    `qmd search ${args.collection ? "--collection " + args.collection + " " : ""}${JSON.stringify(args.query)}`];
                return run("bash", shellArgs);
            },
        },
        {
            name: "resource_check",
            description:
                "Run an on-demand system resource check (CPU, memory, disk, battery).",
            parameters: {
                type: "object",
                properties: {},
            },
            handler: async () => {
                return run("bash", [
                    "/Users/sophiagavrila/.claude/hooks/resource-check.sh",
                    "--report",
                ]);
            },
        },
        {
            name: "pane_color",
            description: "Change the current tmux pane background color.",
            parameters: {
                type: "object",
                properties: {
                    color: {
                        type: "string",
                        description:
                            'Hex color (e.g. "#1a1a2e") or color name',
                    },
                },
                required: ["color"],
            },
            handler: async (args) => {
                return run("tmux", [
                    "select-pane",
                    "-P",
                    `bg=${args.color}`,
                ]);
            },
        },
        {
            name: "screenshot",
            description: "Capture a screenshot of an external monitor.",
            parameters: {
                type: "object",
                properties: {
                    display: {
                        type: "number",
                        description: "Display number (default: 2)",
                    },
                },
            },
            handler: async (args) => {
                const display = args.display ?? 2;
                const outPath = `${cwd}/copilot-screenshot.png`;
                const result = await run("screencapture", [
                    "-D",
                    String(display),
                    outPath,
                ]);
                if (result.startsWith("Error:")) return result;
                return `Screenshot saved to ${outPath}`;
            },
        },
    ],
    hooks: {
        onSessionStart: async () => {
            await session.log("workspace-tools extension loaded (5 tools)");
        },
    },
});
