import { readFileSync, statSync } from "node:fs";
import MiniSearch from "minisearch";
import type { LocatedSkill, SearchHit, SearchResult } from "./types.ts";

const FIELDS = ["name", "description", "body"];
const BOOST = { name: 3, description: 2, body: 1 };
const SNIPPET_RADIUS = 60;

type Document = LocatedSkill & { id: string; body: string };
type CachedBody = { mtimeMs: number; body: string };

// Requires every query word, falling back to any word. Builds a MiniSearch index over skill names, descriptions, and SKILL.md bodies; rebuilds only when a file changes.
export function createSkillSearch(): (skills: LocatedSkill[], query: string, limit: number) => SearchResult {
	const bodies = new Map<string, CachedBody>();
	let indexKey = "";
	let index = newIndex();
	let documents = new Map<string, Document>();
	return (skills, query, limit) => {
		const fresh = skills.map((skill) => ({ ...skill, id: skill.filePath, body: cachedBody(bodies, skill.filePath) }));
		const key = JSON.stringify(fresh.map(({ id, name, description, where }) => [id, name, description, where, bodies.get(id)?.mtimeMs]));
		if (key !== indexKey) {
			index = newIndex();
			index.addAll(fresh);
			documents = new Map(fresh.map((document) => [document.id, document]));
			indexKey = key;
		}
		const all = index.search(query, { combineWith: "AND" });
		const results = all.length ? all : index.search(query);
		return { total: results.length, hits: results.slice(0, limit).map((result) => toHit(documents.get(result.id)!, result)) };
	};
}

function newIndex(): MiniSearch<Document> {
	return new MiniSearch<Document>({
		fields: FIELDS,
		searchOptions: {
			boost: BOOST,
			combineWith: "OR",
			prefix: (term) => term.length >= 3,
			fuzzy: (term) => (term.length >= 5 ? 0.2 : false),
		},
	});
}

function cachedBody(bodies: Map<string, CachedBody>, filePath: string): string {
	let mtimeMs = -1;
	try { mtimeMs = statSync(filePath).mtimeMs; } catch { /* Unreadable files index without a body. */ }
	const cached = bodies.get(filePath);
	if (cached?.mtimeMs === mtimeMs) return cached.body;
	const body = mtimeMs < 0 ? "" : readBody(filePath);
	bodies.set(filePath, { mtimeMs, body });
	return body;
}

function readBody(filePath: string): string {
	try { return readFileSync(filePath, "utf8").replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, ""); } catch { return ""; }
}

function toHit(document: Document, result: { score: number; match: Record<string, string[]> }): SearchHit {
	const { id: _id, body, ...skill } = document;
	const bodyTerms = Object.entries(result.match).filter(([, fields]) => fields.includes("body")).map(([term]) => term);
	return { ...skill, score: result.score, snippet: snippet(body, bodyTerms) };
}

function snippet(body: string, terms: string[]): string | undefined {
	const text = body.replace(/\s+/g, " ").trim();
	const lower = text.toLowerCase();
	const at = Math.min(...terms.map((term) => lower.indexOf(term)).filter((position) => position >= 0));
	if (!Number.isFinite(at)) return undefined;
	const start = Math.min(at, wordStart(text, Math.max(0, at - SNIPPET_RADIUS)));
	const end = wordEnd(text, Math.min(text.length, at + SNIPPET_RADIUS));
	return `${start > 0 ? "…" : ""}${text.slice(start, end).trim()}${end < text.length ? "…" : ""}`;
}

function wordStart(text: string, position: number): number {
	const space = text.indexOf(" ", position);
	return position === 0 || space < 0 ? position : space + 1;
}

function wordEnd(text: string, position: number): number {
	const space = text.lastIndexOf(" ", position);
	return position === text.length || space < 0 ? position : space;
}
