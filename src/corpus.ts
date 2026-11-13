import { realpathSync } from "node:fs";
import type { LocatedSkill, RouteEntry, SkillEntry } from "./types.ts";

export const ROUTES_CHANNEL = "pi-skill-router:routes";

type PromptSkill = SkillEntry & { disableModelInvocation?: boolean };

// Prompt skills plus routed children, one entry per canonical file, labeled by route.
export function buildCorpus(prompt: PromptSkill[], routes: RouteEntry[]): LocatedSkill[] {
	const byPath = new Map<string, SkillEntry>();
	for (const skill of prompt) {
		if (skill.disableModelInvocation) continue;
		const filePath = canonical(skill.filePath);
		if (!byPath.has(filePath)) byPath.set(filePath, { name: skill.name, description: skill.description, filePath });
	}
	const owners = new Map<string, string[]>();
	for (const route of routes) {
		for (const child of route.children) {
			if (!byPath.has(child.filePath)) byPath.set(child.filePath, child);
			owners.set(child.filePath, [...(owners.get(child.filePath) ?? []), route.name]);
		}
	}
	const routeNames = new Set(routes.map((route) => route.name));
	return [...byPath.values()].map((skill) => ({ ...skill, where: location(skill, owners, routeNames) }));
}

export function parseRoutes(data: unknown): RouteEntry[] {
	const routes = (data as { routes?: unknown } | undefined)?.routes;
	if (!Array.isArray(routes)) return [];
	return routes.filter((route): route is RouteEntry => typeof route?.name === "string" && Array.isArray(route.children))
		.map((route) => ({ name: route.name, children: route.children.filter(isSkillEntry) }));
}

function location(skill: SkillEntry, owners: Map<string, string[]>, routeNames: Set<string>): string {
	const routes = owners.get(skill.filePath);
	if (routes) return routes.join(", ");
	return routeNames.has(skill.name) ? "route" : "top-level";
}

function isSkillEntry(value: unknown): value is SkillEntry {
	const entry = value as Partial<SkillEntry> | undefined;
	return typeof entry?.name === "string" && typeof entry.description === "string" && typeof entry.filePath === "string";
}

function canonical(filePath: string): string {
	try { return realpathSync(filePath); } catch { return filePath; }
}
