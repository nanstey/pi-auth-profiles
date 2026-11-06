import { afterEach, expect, mock, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let agentDir = "";

mock.module("@earendil-works/pi-coding-agent", () => ({
	getAgentDir: () => agentDir,
	ProjectTrustStore: class {
		getEntry() {
			return undefined;
		}
	},
}));

const { default: installExtension } = await import("../extensions/auth-profiles.ts");

type SessionReason = "startup" | "reload" | "new" | "resume" | "fork";
type Handler = (event: { reason: SessionReason }, ctx: ReturnType<typeof createContext>) => Promise<void>;
type CommandHandler = (args: string, ctx: ReturnType<typeof createContext>) => Promise<void>;

class Store {
	constructor(readonly path?: string) {}

	static create(path?: string) {
		return new Store(path);
	}
}

function createApi() {
	let sessionStart: Handler | undefined;
	let profile: CommandHandler | undefined;
	installExtension({
		on(event: string, handler: Handler) {
			if (event === "session_start") sessionStart = handler;
		},
		registerCommand(name: string, command: { handler: CommandHandler }) {
			if (name === "profile") profile = command.handler;
		},
	} as never);
	if (!sessionStart || !profile) throw new Error("Extension did not register its session handler and profile command.");
	return { sessionStart, profile };
}

function createContext() {
	const notifications: string[] = [];
	const refreshes: string[] = [];
	const credentials = { store: new Store("unbound") };
	return {
		cwd: join(agentDir, "project"),
		isProjectTrusted: () => false,
		modelRegistry: {
			runtime: { credentials },
			refresh: async () => {
				refreshes.push(credentials.store.path ?? "");
			},
		},
		ui: {
			notify: (message: string) => notifications.push(message),
		},
		notifications,
		refreshes,
	};
}

afterEach(() => {
	if (agentDir) rmSync(agentDir, { recursive: true, force: true });
	agentDir = "";
});

test("preserves the process-start profile across recreated extension factories", async () => {
	agentDir = mkdtempSync(join(tmpdir(), "pi-auth-profiles-"));
	mkdirSync(join(agentDir, "auth-profiles"), { recursive: true });
	writeFileSync(join(agentDir, "auth-profiles.json"), '{"defaultProfile":"startup"}\n');
	const startupPath = join(agentDir, "auth-profiles", "startup.json");

	const initial = createApi();
	const startup = createContext();
	await initial.sessionStart({ reason: "startup" }, startup);
	expect(startup.refreshes).toEqual([startupPath]);

	writeFileSync(join(agentDir, "auth-profiles.json"), '{"defaultProfile":"changed"}\n');
	let activeRuntime = startup;
	for (const reason of ["new", "resume", "fork"] as const) {
		const freshFactory = createApi();
		activeRuntime = createContext();
		await freshFactory.sessionStart({ reason }, activeRuntime);
		expect(activeRuntime.refreshes).toEqual([startupPath]);

		await freshFactory.profile("show", activeRuntime);
		const profile = activeRuntime.notifications.at(-1) ?? "";
		expect(profile).toContain("Auth profile: startup (global default)");
		expect(profile).toContain(`File: ${startupPath}`);
		expect(profile).toContain("Configured after restart: changed (global default)");
		expect(profile).not.toContain("unavailable");
	}

	const reloadFactory = createApi();
	await reloadFactory.sessionStart({ reason: "reload" }, activeRuntime);
	expect(activeRuntime.refreshes).toEqual([startupPath]);
	await reloadFactory.profile("show", activeRuntime);
	expect(activeRuntime.notifications.at(-1)).toContain("Auth profile: startup (global default)");
});
