import { Type } from "@earendil-works/pi-ai";
import type { ExtensionAPI, Skill } from "@earendil-works/pi-coding-agent";
import { buildCorpus, parseRoutes, ROUTES_CHANNEL } from "./src/corpus.ts";
import { DEFAULT_LIMIT, formatSearchReport, MAX_LIMIT, parseLimit, USAGE } from "./src/report.ts";
import { createSkillSearch } from "./src/search.ts";
import type { RouteEntry } from "./src/types.ts";

export default function skillSearchExtension(pi: ExtensionAPI): void {
	let promptSkills: Skill[] = [];
	let routes: RouteEntry[] = [];
	const search = createSkillSearch();

	pi.events?.on(ROUTES_CHANNEL, (data) => { routes = parseRoutes(data); });
	// Copy before later handlers, such as pi-skill-router, replace the list.
	pi.on("before_agent_start", (event) => {
		const skills = event.systemPromptOptions?.skills;
		if (Array.isArray(skills)) promptSkills = [...skills];
		return {};
	});

	const report = (skills: Skill[], query: unknown, limit: unknown): string => {
		const text = typeof query === "string" ? query.trim() : "";
		if (!text) return USAGE;
		try {
			return formatSearchReport(text, search(buildCorpus(skills, routes), text, parseLimit(limit)));
		} catch (error) {
			return `Skill search failed: ${error instanceof Error ? error.message : String(error)}`;
		}
	};

	pi.registerCommand("skill-search", {
		description: "Search skill names, descriptions, and bodies, including routed skills: <query>",
		handler: async (args, ctx) => {
			const text = report(ctx.getSystemPromptOptions().skills ?? [], args, undefined);
			if (ctx.hasUI) ctx.ui.notify(text, "info");
			else console.log(text);
		},
	});
	pi.registerTool({
		name: "skill_search",
		label: "Skill Search",
		description: "Read-only. Full-text search over skill names, descriptions, and SKILL.md bodies, including skills hidden behind pi-skill-router routes. Returns matching skills with route, SKILL.md path, and a body snippet.",
		parameters: Type.Object({
			query: Type.String({ description: "Words to search for" }),
			limit: Type.Optional(Type.Integer({ minimum: 1, maximum: MAX_LIMIT, description: `Maximum results (default ${DEFAULT_LIMIT})` })),
		}),
		async execute(_id, params) {
			const { query, limit } = params as { query?: unknown; limit?: unknown };
			return { content: [{ type: "text", text: report(promptSkills, query, limit) }], details: undefined };
		},
	});
}
