import { afterEach, expect, mock, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
const processProfileStateKey = Symbol.for("@nanstey/pi-auth-profiles/process-profile-state");
let reloadEvaluation = 0;

type SessionReason = "startup" | "reload" | "new" | "resume" | "fork";
type Handler = (event: { reason: SessionReason }, ctx: ReturnType<typeof createContext>) => Promise<void>;
type CommandHandler = (args: string, ctx: ReturnType<typeof createContext>) => Promise<void>;
type ProfileCommand = {
	handler: CommandHandler;
	getArgumentCompletions: (prefix: string) => Array<{ value: string; label: string }>;
};

class Store {
	constructor(readonly path?: string) {}

	static create(path?: string) {
		return new Store(path);
	}

	data: Record<string, unknown> = {};

	async modify(provider: string, fn: (current: unknown) => unknown | Promise<unknown>) {
		const next = await fn(this.data[provider]);
		if (next === undefined) return this.data[provider];
		this.data[provider] = next;
		return next;
	}
}

function createApi(extension = installExtension) {
	let sessionStart: Handler | undefined;
	let profile: CommandHandler | undefined;
	let profileCommand: ProfileCommand | undefined;
	extension({
		on(event: string, handler: Handler) {
			if (event === "session_start") sessionStart = handler;
		},
		registerCommand(name: string, command: ProfileCommand) {
			if (name === "profile") {
				profile = command.handler;
				profileCommand = command;
			}
		},
	} as never);
	if (!sessionStart || !profile || !profileCommand) {
		throw new Error("Extension did not register its session handler and profile command.");
	}
	return { sessionStart, profile, profileCommand };
}

async function createReloadedApi() {
	const { default: reloadedExtension } = await import(`../extensions/auth-profiles.ts?reload=${reloadEvaluation++}`);
	return createApi(reloadedExtension);
}

function createContext(trusted = false) {
	const notifications: string[] = [];
	const refreshes: string[] = [];
	const credentials = { store: new Store("unbound") };
	return {
		cwd: join(agentDir, "project"),
		isProjectTrusted: () => trusted,
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
	delete (globalThis as { [key: symbol]: unknown })[processProfileStateKey];
});

test("preserves the process-start profile across recreated factories and module re-evaluation", async () => {
	agentDir = mkdtempSync(join(tmpdir(), "pi-auth-profiles-"));
	mkdirSync(join(agentDir, "auth-profiles"), { recursive: true });
	writeFileSync(join(agentDir, "auth-profiles.json"), '{"defaultProfile":"startup"}\n');
	const startupPath = join(agentDir, "auth-profiles", "startup.json");

	const initial = createApi();
	const startup = createContext();
	await initial.sessionStart({ reason: "startup" }, startup);
	expect(startup.refreshes).toEqual([startupPath]);

	writeFileSync(join(agentDir, "auth-profiles.json"), '{"defaultProfile":"changed"}\n');
	const reloadFactory = await createReloadedApi();
	await reloadFactory.sessionStart({ reason: "reload" }, startup);
	expect(startup.refreshes).toEqual([startupPath]);
	await reloadFactory.profile("show", startup);
	expect(startup.notifications.at(-1)).toContain("Auth profile: startup (global default)");

	for (const reason of ["new", "resume", "fork"] as const) {
		const freshFactory = await createReloadedApi();
		const freshRuntime = createContext();
		await freshFactory.sessionStart({ reason }, freshRuntime);
		expect(freshRuntime.refreshes).toEqual([startupPath]);

		await freshFactory.profile("show", freshRuntime);
		const profile = freshRuntime.notifications.at(-1) ?? "";
		expect(profile).toContain("Auth profile: startup (global default)");
		expect(profile).toContain(`File: ${startupPath}`);
		expect(profile).toContain("Configured after restart: changed (global default)");
		expect(profile).not.toContain("unavailable");
	}
});

test("uses set as the canonical project-profile command and retains use as a deprecated alias", async () => {
	agentDir = mkdtempSync(join(tmpdir(), "pi-auth-profiles-"));
	const { profile, profileCommand } = createApi();
	const context = createContext(true);
	const settingsPath = join(context.cwd, ".pi", "settings.json");

	const completions = profileCommand.getArgumentCompletions("");
	expect(completions).toContainEqual({ value: "set", label: "set" });
	expect(completions).toContainEqual({ value: "use", label: "use (deprecated; use set)" });
	expect(profileCommand.getArgumentCompletions("set ")).toContainEqual({ value: "set default", label: "set default" });

	await profile("set work", context);
	expect(readFileSync(settingsPath, "utf8")).toBe('{\n\t"authProfile": "work"\n}\n');
	expect(context.notifications.at(-1)).toContain("Project auth profile set to work.");
	expect(context.notifications.at(-1)).toContain("Restart the Pi process");
	expect(context.notifications.at(-1)).not.toContain("Deprecated:");

	await profile("use personal", context);
	expect(readFileSync(settingsPath, "utf8")).toBe('{\n\t"authProfile": "personal"\n}\n');
	expect(context.notifications.at(-1)).toContain("Deprecated: /profile use is deprecated; use /profile set <name>.");

	const untrusted = createContext(false);
	await profile("set denied", untrusted);
	expect(readFileSync(settingsPath, "utf8")).toBe('{\n\t"authProfile": "personal"\n}\n');
	expect(untrusted.notifications.at(-1)).toBe("Project is not trusted; cannot set a project auth profile here.");
});

test("notifies the real profile file on login but not on refresh, logout, or default profile", async () => {
	agentDir = mkdtempSync(join(tmpdir(), "pi-auth-profiles-"));
	mkdirSync(join(agentDir, "auth-profiles"), { recursive: true });
	writeFileSync(join(agentDir, "auth-profiles.json"), '{"defaultProfile":"work"}\n');
	const workPath = join(agentDir, "auth-profiles", "work.json");

	const startup = createContext();
	await createApi().sessionStart({ reason: "startup" }, startup);
	// Re-binding on new/resume/fork must not stack notifications.
	for (const reason of ["new", "resume", "fork"] as const) {
		await (await createReloadedApi()).sessionStart({ reason }, startup);
	}
	startup.notifications.length = 0;
	const store = startup.modelRegistry.runtime.credentials.store;

	await store.modify("anthropic", () => ({ type: "oauth", access: "a1", refresh: "r1", expires: 1 }));
	expect(startup.notifications).toEqual([`Saved anthropic credentials to ${workPath} (profile: work)`]);

	// Token refresh: same refresh token, new access token.
	await store.modify("anthropic", () => ({ type: "oauth", access: "a2", refresh: "r1", expires: 2 }));
	// No-op and logout-style (undefined) results.
	await store.modify("anthropic", () => undefined);
	expect(startup.notifications).toHaveLength(1);

	await store.modify("openai", () => ({ type: "api_key", key: "k1" }));
	await store.modify("openai", () => ({ type: "api_key", key: "k2" }));
	expect(startup.notifications).toHaveLength(3);

	const fresh = createContext();
	writeFileSync(join(agentDir, "auth-profiles.json"), '{"defaultProfile":"default"}\n');
	delete (globalThis as { [key: symbol]: unknown })[processProfileStateKey];
	await createApi().sessionStart({ reason: "startup" }, fresh);
	fresh.notifications.length = 0;
	await fresh.modelRegistry.runtime.credentials.store.modify("openai", () => ({ type: "api_key", key: "k" }));
	expect(fresh.notifications).toEqual([]);
});
