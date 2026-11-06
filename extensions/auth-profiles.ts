/**
 * auth-profiles — per-project OAuth/API-key credential profiles for pi.
 *
 * Profiles are separate credential files:
 *   default        -> ~/.pi/agent/auth.json
 *   <name>         -> ~/.pi/agent/auth-profiles/<name>.json
 *
 * Profile selection (first match wins):
 *   1. "authProfile" in the nearest <cwd-or-trusted-ancestor>/.pi/settings.json
 *      (trusted sessions may use cwd; ancestors require unbroken persisted trust)
 *      If none is found and cwd is a linked git worktree, the same lookup runs
 *      from the main checkout (which needs its own persisted trust chain).
 *   2. "defaultProfile" in ~/.pi/agent/auth-profiles.json
 *   3. "default"
 *
 * This lets a directory such as ~/Code/noelcf/.pi/settings.json select a
 * profile for every repository below ~/Code/noelcf without duplicating it.
 *
 * The extension binds the AuthStorage backend at session_start. Profile commands
 * only persist configuration; restart Pi before the selected profile becomes active.
 *
 * Commands:
 *   /profile                 show the active profile
 *   /profile list            list profiles and their providers
 *   /profile use <name>      set this project's profile (writes .pi/settings.json)
 *   /profile default <name>  set the global fallback profile
 *   /profile clear           remove this project's profile setting
 */
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getAgentDir, ProjectTrustStore } from "@earendil-works/pi-coding-agent";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";

const DEFAULT_PROFILE = "default";

const profilesDir = () => join(getAgentDir(), "auth-profiles");
const globalConfigPath = () => join(getAgentDir(), "auth-profiles.json");
const projectSettingsPath = (cwd: string) => join(cwd, ".pi", "settings.json");

function normalizeName(name: string): string {
	const trimmed = (name ?? "").trim();
	if (!trimmed) return DEFAULT_PROFILE;
	if (trimmed !== DEFAULT_PROFILE && !/^[A-Za-z0-9._-]+$/.test(trimmed)) {
		throw new Error(`Invalid profile name "${trimmed}". Use letters, numbers, dots, underscores, and dashes.`);
	}
	if (trimmed === "." || trimmed === "..") {
		throw new Error(`Invalid profile name "${trimmed}".`);
	}
	return trimmed;
}

function authPathFor(profile: string): string {
	return profile === DEFAULT_PROFILE ? join(getAgentDir(), "auth.json") : join(profilesDir(), `${profile}.json`);
}

function readJsonFile(path: string): Record<string, unknown> | undefined {
	try {
		return JSON.parse(readFileSync(path, "utf8"));
	} catch {
		return undefined;
	}
}

function canonicalPath(path: string): string {
	try {
		return realpathSync(path);
	} catch {
		return resolve(path);
	}
}

function isWithin(directory: string, ancestor: string): boolean {
	const path = relative(ancestor, directory);
	return path === "" || (!path.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) && path !== ".." && !isAbsolute(path));
}

function findProjectProfile(cwd: string, trustedRoot: string): { profile: string; settingsPath: string } | undefined {
	let directory = canonicalPath(cwd);
	while (isWithin(directory, trustedRoot)) {
		const settingsPath = projectSettingsPath(directory);
		const profile = readJsonFile(settingsPath)?.authProfile;
		if (typeof profile === "string" && profile.trim()) {
			return { profile: normalizeName(profile), settingsPath };
		}

		const parent = dirname(directory);
		if (parent === directory) return undefined;
		directory = parent;
	}
	return undefined;
}

function persistedTrustedRoot(cwd: string): string | undefined {
	let trustedRoot: string | undefined;
	try {
		const trustStore = new ProjectTrustStore(getAgentDir());
		let trustEntry = trustStore.getEntry(cwd);
		// A nearer true entry must not hide another trusted root above it.
		// Stop at the first false or when no saved trust remains.
		while (trustEntry?.decision === true) {
			trustedRoot = trustEntry.path;
			const parent = dirname(trustedRoot);
			if (parent === trustedRoot) break;
			trustEntry = trustStore.getEntry(parent);
		}
		return trustedRoot;
	} catch {
		// A failed lookup cannot extend the known-safe boundary.
		return trustedRoot;
	}
}

/**
 * Main checkout of the repository that `cwd` belongs to, when `cwd` is a linked
 * worktree living elsewhere (e.g. ~/orca/workspaces/<repo>/<branch>).
 */
function mainWorktreeRoot(cwd: string): string | undefined {
	try {
		const [toplevel, commonDir] = execFileSync(
			"git",
			["-C", cwd, "rev-parse", "--path-format=absolute", "--show-toplevel", "--git-common-dir"],
			{ encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 2000 },
		)
			.trim()
			.split("\n");
		if (!toplevel || !commonDir || basename(commonDir) !== ".git") return undefined;
		const root = canonicalPath(dirname(commonDir));
		// Only a linked worktree qualifies; a subdirectory of the main checkout
		// must not skip the persisted-trust walk that stopped at cwd.
		return root === canonicalPath(toplevel) ? undefined : root;
	} catch {
		return undefined;
	}
}

function resolveProfile(ctx: Pick<ExtensionContext, "cwd" | "isProjectTrusted">): { profile: string; source: string } {
	if (ctx.isProjectTrusted()) {
		const trustedRoot = persistedTrustedRoot(ctx.cwd) ?? canonicalPath(ctx.cwd);
		const project = findProjectProfile(ctx.cwd, trustedRoot);
		if (project) {
			return { profile: project.profile, source: `project: ${project.settingsPath}` };
		}
		// Linked worktrees outside the parent folder inherit from their main checkout.
		// The main checkout needs its own persisted trust chain.
		const mainRoot = mainWorktreeRoot(ctx.cwd);
		const mainTrustedRoot = mainRoot && persistedTrustedRoot(mainRoot);
		const inherited = mainRoot && mainTrustedRoot ? findProjectProfile(mainRoot, mainTrustedRoot) : undefined;
		if (inherited) {
			return { profile: inherited.profile, source: `main worktree: ${inherited.settingsPath}` };
		}
	}
	const global = readJsonFile(globalConfigPath())?.defaultProfile;
	if (typeof global === "string" && global.trim()) {
		return { profile: normalizeName(global), source: "global default" };
	}
	return { profile: DEFAULT_PROFILE, source: "built-in default" };
}

type InternalAuthStorage = {
	constructor: { create(path?: string): InternalAuthStorage };
};

type InternalRuntime = {
	credentials?: { store?: InternalAuthStorage };
};

/** Point the session's live credential store at the profile's file. */
async function bindProfile(ctx: Pick<ExtensionContext, "modelRegistry">, profile: string): Promise<string> {
	const path = authPathFor(profile);
	// Pi no longer exposes its file-auth backend to extensions. Reuse the active
	// store's factory so Pi retains its own locking, permissions, and reload logic.
	const runtime = (ctx.modelRegistry as unknown as { runtime?: InternalRuntime }).runtime;
	const store = runtime?.credentials?.store;
	const create = store?.constructor?.create;
	if (!runtime || !store || typeof create !== "function") {
		throw new Error("Auth profiles is incompatible with this version of pi: credential storage cannot be switched.");
	}
	runtime.credentials!.store = create.call(store.constructor, path);

	// Refresh Pi's provider-auth status after binding during session startup.
	await ctx.modelRegistry.refresh({ allowNetwork: false });
	return path;
}

function listProfiles(): string[] {
	const names = [DEFAULT_PROFILE];
	if (existsSync(profilesDir())) {
		for (const file of readdirSync(profilesDir()).sort()) {
			if (file.endsWith(".json") && !file.endsWith(".lock")) {
				names.push(file.slice(0, -".json".length));
			}
		}
	}
	return names;
}

function providersIn(profile: string): string[] {
	return Object.keys(readJsonFile(authPathFor(profile)) ?? {});
}

function updateJsonFile(path: string, update: (data: Record<string, unknown>) => void): void {
	let data: Record<string, unknown> = {};
	if (existsSync(path)) {
		const parsed = readJsonFile(path);
		if (parsed === undefined) {
			throw new Error(`${path} exists but is not valid JSON; not overwriting it.`);
		}
		data = parsed;
	}
	update(data);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, JSON.stringify(data, null, "\t") + "\n");
}

export default function (pi: ExtensionAPI) {
	let activeProfile = DEFAULT_PROFILE;
	let activeSource = "built-in default";

	const bindAtSessionStart = async (ctx: Pick<ExtensionContext, "cwd" | "isProjectTrusted" | "modelRegistry">) => {
		const { profile, source } = resolveProfile(ctx);
		await bindProfile(ctx, profile);
		activeProfile = profile;
		activeSource = source;
		return { profile, source };
	};

	pi.on("session_start", async (_event, ctx) => {
		const { profile, source } = await bindAtSessionStart(ctx);
		if (profile !== DEFAULT_PROFILE) {
			ctx.ui.notify(`Auth profile: ${profile} (${source})`, "info");
		}
	});

	pi.registerCommand("profile", {
		description: "Manage auth profiles: show | list | use <name> | default <name> | clear",
		getArgumentCompletions: (prefix) => {
			const words = prefix.split(/\s+/);
			const items =
				words.length <= 1
					? ["show", "list", "use", "default", "clear"]
					: ["use", "default"].includes(words[0])
						? listProfiles().map((name) => `${words[0]} ${name}`)
						: [];
			return items.filter((item) => item.startsWith(prefix)).map((value) => ({ value, label: value }));
		},
		handler: async (args, ctx) => {
			const [command, rawName] = args.trim().split(/\s+/).filter(Boolean);
			const usage = "Usage: /profile [show|list|use <name>|default <name>|clear]";
			try {
				switch (command ?? "show") {
					case "show": {
						const configured = resolveProfile(ctx);
						const providers = providersIn(activeProfile);
						const configuredAfterRestart =
							configured.profile === activeProfile
								? ""
								: `\nConfigured after restart: ${configured.profile} (${configured.source})`;
						ctx.ui.notify(
							`Auth profile: ${activeProfile} (${activeSource})\n` +
								`File: ${authPathFor(activeProfile)}\n` +
								`Providers: ${providers.length ? providers.join(", ") : "none — run /login"}` +
								configuredAfterRestart,
							"info",
						);
						return;
					}
					case "list": {
						const lines = listProfiles().map((name) => {
							const marker = name === activeProfile ? "* " : "  ";
							const providers = providersIn(name);
							return `${marker}${name} (${providers.length ? providers.join(", ") : "no credentials"})`;
						});
						ctx.ui.notify(lines.join("\n"), "info");
						return;
					}
					case "use": {
						if (!rawName) return ctx.ui.notify(usage, "warning");
						const profile = normalizeName(rawName);
						if (!ctx.isProjectTrusted()) {
							ctx.ui.notify("Project is not trusted; cannot set a project auth profile here.", "error");
							return;
						}
						const settingsPath = projectSettingsPath(ctx.cwd);
						updateJsonFile(settingsPath, (settings) => {
							settings.authProfile = profile;
						});
						ctx.ui.notify(
							`Project auth profile set to ${profile}. Settings: ${settingsPath}\n` +
								"Restart Pi before this profile becomes active.",
							"info",
						);
						return;
					}
					case "default": {
						if (!rawName) return ctx.ui.notify(usage, "warning");
						const profile = normalizeName(rawName);
						updateJsonFile(globalConfigPath(), (config) => {
							config.defaultProfile = profile;
						});
						ctx.ui.notify(
							`Global default auth profile set to ${profile}.\n` +
								"Restart Pi before this setting can affect the active profile.",
							"info",
						);
						return;
					}
					case "clear": {
						if (!ctx.isProjectTrusted()) {
							ctx.ui.notify("Project is not trusted; cannot clear a project auth profile here.", "error");
							return;
						}
						const path = projectSettingsPath(ctx.cwd);
						if (existsSync(path)) {
							updateJsonFile(path, (settings) => {
								delete settings.authProfile;
							});
						}
						ctx.ui.notify(
							"Project auth profile cleared. Restart Pi before the configured profile changes the active profile.",
							"info",
						);
						return;
					}
					default:
						ctx.ui.notify(usage, "warning");
				}
			} catch (error) {
				ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
			}
		},
	});
}
