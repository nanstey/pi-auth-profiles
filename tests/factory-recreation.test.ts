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
const processProfileStateKey = Symbol.for("@nanstey/pi-auth-profiles/process-profile-state");
let reloadEvaluation = 0;

type SessionReason = "startup" | "reload" | "new" | "resume" | "fork";
type Handler = (event: { reason: SessionReason }, ctx: ReturnType<typeof createContext>) => Promise<void>;
type CommandHandler = (args: string, ctx: ReturnType<typeof createContext>) => Promise<void>;

class Store {
	constructor(readonly path?: string) {}

	static create(path?: string) {
		return new Store(path);
	}
}

function createApi(extension = installExtension) {
	let sessionStart: Handler | undefined;
	let profile: CommandHandler | undefined;
	extension({
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

async function createReloadedApi() {
	const { default: reloadedExtension } = await import(`../extensions/auth-profiles.ts?reload=${reloadEvaluation++}`);
	return createApi(reloadedExtension);
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
