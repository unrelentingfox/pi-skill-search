import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { buildCorpus, parseRoutes } from "../src/corpus.ts";
import { formatSearchReport, parseLimit } from "../src/report.ts";
import { createSkillSearch } from "../src/search.ts";

const scratch = realpathSync(mkdtempSync(join(tmpdir(), "pi-skill-search.")));
after(() => rmSync(scratch, { recursive: true, force: true }));

function skill(name: string, description: string, body: string) {
	mkdirSync(join(scratch, name), { recursive: true });
	const filePath = join(scratch, name, "SKILL.md");
	writeFileSync(filePath, `---\nname: ${name}\ndescription: ${description}\n---\n\n${body}\n`);
	return { name, description, filePath };
}

describe("buildCorpus", () => {
	it("merges routed children, dedupes canonical files, and labels locations", () => {
		const top = skill("top-skill", "Top.", "x");
		const child = skill("child-skill", "Child.", "x");
		const corpus = buildCorpus([
			top, { ...top }, { name: "route-ops", description: "Route.", filePath: "/missing/route-ops/SKILL.md" },
			{ name: "hidden", description: "Manual.", filePath: "/missing/hidden/SKILL.md", disableModelInvocation: true },
		], [{ name: "route-ops", children: [child] }, { name: "route-two", children: [child] }]);
		assert.deepEqual(corpus.map(({ name, where }) => [name, where]), [
			["top-skill", "top-level"], ["route-ops", "route"], ["child-skill", "route-ops, route-two"],
		]);
	});
});

describe("parseRoutes", () => {
	it("keeps valid routes and children only", () => {
		const child = { name: "a", description: "A.", filePath: "/a/SKILL.md" };
		assert.deepEqual(parseRoutes({ routes: [{ name: "route-x", children: [child, { name: 1 }, null] }, { name: 2 }, null] }),
			[{ name: "route-x", children: [child] }]);
		assert.deepEqual(parseRoutes(undefined), []);
		assert.deepEqual(parseRoutes({ routes: "no" }), []);
	});
});

describe("createSkillSearch", () => {
	const deploy = skill("deploy-helper", "Ship services.", "Run the pipeline.");
	const notes = skill("notes", "Write notes.", `${"filler ".repeat(20)}Use cw-dashboards share to publish a dashboard. ${"tail ".repeat(20)}`);
	const corpus = () => buildCorpus([deploy, notes, { name: "gone", description: "Missing file.", filePath: join(scratch, "gone", "SKILL.md") }], []);

	it("ranks name matches above body matches and shows body snippets", () => {
		const result = createSkillSearch()(corpus(), "deploy dashboard", 10);
		assert.deepEqual(result.hits.map((hit) => hit.name), ["deploy-helper", "notes"]);
		assert.equal(result.hits[0].snippet, undefined);
		assert.match(result.hits[1].snippet!, /^…filler .*cw-dashboards share to publish a dashboard\..*tail…$/);
	});

	it("requires every word, then falls back to any word", () => {
		const search = createSkillSearch();
		assert.deepEqual(search(corpus(), "notes dashboard", 10).hits.map((hit) => hit.name), ["notes"]);
		assert.deepEqual(search(corpus(), "notes pipeline", 10).hits.map((hit) => hit.name).sort(), ["deploy-helper", "notes"]);
	});

	it("matches prefixes and typos, limits results, and skips unreadable files", () => {
		const search = createSkillSearch();
		assert.deepEqual(search(corpus(), "pipel", 10).hits.map((hit) => hit.name), ["deploy-helper"]);
		assert.deepEqual(search(corpus(), "dashbord", 10).hits.map((hit) => hit.name), ["notes"]);
		assert.deepEqual(search(corpus(), "missing", 10).hits.map((hit) => [hit.name, hit.snippet]), [["gone", undefined]]);
		const limited = search(corpus(), "notes deploy", 1);
		assert.equal(limited.total, 2);
		assert.equal(limited.hits.length, 1);
	});

	it("indexes a skill whose SKILL.md cannot be read", () => {
		mkdirSync(join(scratch, "dir-skill", "SKILL.md"), { recursive: true });
		const result = createSkillSearch()([{ name: "dir-skill", description: "Odd.", filePath: join(scratch, "dir-skill", "SKILL.md"), where: "top-level" }], "odd", 10);
		assert.deepEqual(result.hits.map((hit) => [hit.name, hit.snippet]), [["dir-skill", undefined]]);
	});

	it("reindexes when a SKILL.md changes", () => {
		const search = createSkillSearch();
		assert.equal(search(corpus(), "zebra", 10).total, 0);
		writeFileSync(notes.filePath, "---\nname: notes\n---\nzebra crossing\n");
		utimesSync(notes.filePath, new Date(), new Date(Date.now() + 5000));
		assert.equal(search(corpus(), "zebra", 10).hits[0].snippet, "zebra crossing");
		assert.equal(search(corpus(), "zebra", 10).total, 1);
	});
});

describe("formatSearchReport", () => {
	it("formats hits, truncates descriptions, and reports no matches", () => {
		const hit = { name: "a", description: `long\n${"y".repeat(200)}`, filePath: "/a/SKILL.md", where: "route-x", score: 1, snippet: "…body…" };
		assert.equal(formatSearchReport("q", { total: 3, hits: [hit] }), [
			"[pi-skill-search]", "", 'Query: "q" (1 of 3 matches)', "",
			" - a [route-x] /a/SKILL.md", `   long ${"y".repeat(154)}…`, "   body: …body…",
		].join("\n"));
		assert(formatSearchReport("q", { total: 0, hits: [] }).endsWith("(0 of 0 matches)\n\n - None"));
	});

	it("parses limits", () => {
		assert.equal(parseLimit(undefined), 10);
		assert.equal(parseLimit(0), 10);
		assert.equal(parseLimit(1.5), 10);
		assert.equal(parseLimit(3), 3);
		assert.equal(parseLimit(500), 50);
	});
});
