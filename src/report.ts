import type { SearchHit, SearchResult } from "./types.ts";

export const DEFAULT_LIMIT = 10;
export const MAX_LIMIT = 50;
const DESCRIPTION_LIMIT = 160;

export const USAGE = "Usage: /skill-search <query>; matches skill names, descriptions, and SKILL.md bodies, including routed skills.";

export function formatSearchReport(query: string, result: SearchResult): string {
	const lines = ["[pi-skill-search]", "", `Query: ${JSON.stringify(query)} (${result.hits.length} of ${result.total} matches)`, ""];
	lines.push(...(result.hits.length ? result.hits.flatMap(formatHit) : [" - None"]));
	return lines.join("\n");
}

export function parseLimit(value: unknown): number {
	return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? Math.min(value, MAX_LIMIT) : DEFAULT_LIMIT;
}

function formatHit(hit: SearchHit): string[] {
	const lines = [` - ${hit.name} [${hit.where}] ${hit.filePath}`, `   ${truncate(hit.description.replace(/\s+/g, " ").trim())}`];
	if (hit.snippet) lines.push(`   body: ${hit.snippet}`);
	return lines;
}

function truncate(text: string): string {
	return text.length > DESCRIPTION_LIMIT ? `${text.slice(0, DESCRIPTION_LIMIT - 1)}…` : text;
}
