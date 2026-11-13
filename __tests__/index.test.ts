import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import skillSearchExtension from "../index.ts";
import { ROUTES_CHANNEL } from "../src/corpus.ts";

type Handler = (event: unknown) => unknown;
type Command = { handler: (args: string, ctx: ExtensionContext) => Promise<void> };
type Tool = { execute: (...args: unknown[]) => Promise<{ content: { text: string }[] }> };

const scratch = realpathSync(mkdtempSync(join(tmpdir(), "pi-skill-search-index.")));
after(() => rmSync(scratch, { recursive: true, force: true }));
const file = (name: string, body: string) => {
	mkdirSync(join(scratch, name), { recursive: true });
	writeFileSync(join(scratch, name, "SKILL.md"), `---\nname: ${name}\n---\n${body}\n`);
	return join(scratch, name, "SKILL.md");
};
const top = { name: "top-skill", description: "Top.", filePath: file("top-skill", "alpha"), disableModelInvocation: false };
const child = { name: "child-skill", description: "Child.", filePath: file("child-skill", "bravo") };

function fakePi(withEvents = true) {
	const handlers = new Map<string, Handler>();
	const listeners = new Map<string, (data: unknown) => void>();
	const commands = new Map<string, Command>();
	const tools = new Map<string, Tool>();
	skillSearchExtension({
		on: (name: string, handler: Handler) => handlers.set(name, handler),
		registerCommand: (name: string, command: Command) => commands.set(name, command),
		registerTool: (tool: Tool & { name: string }) => tools.set(tool.name, tool),
		events: withEvents ? { on: (channel: string, listener: (data: unknown) => void) => listeners.set(channel, listener) } : undefined,
	} as unknown as ExtensionAPI);
	return { handlers, listeners, commands, tools };
}

const context = (notes: string[], hasUI = true) => ({ hasUI, ui: { notify: (text: string) => notes.push(text) },
	getSystemPromptOptions: () => ({ skills: [top] }) }) as unknown as ExtensionContext;

describe("skill_search tool", () => {
	it("searches the last turn's skills plus routed children", async () => {
		const { handlers, listeners, tools } = fakePi();
		listeners.get(ROUTES_CHANNEL)!({ routes: [{ name: "route-x", children: [child] }] });
		const event = { systemPromptOptions: { skills: [top] } };
		assert.deepEqual(handlers.get("before_agent_start")!(event), {});
		handlers.get("before_agent_start")!({});
		const tool = tools.get("skill_search")!;
		const run = async (params: unknown) => (await tool.execute("id", params)).content[0].text;
		assert((await run({ query: "bravo" })).includes(" - child-skill [route-x] "));
		assert((await run({ query: "alpha", limit: 5 })).includes(" - top-skill [top-level] "));
		assert((await run({ query: " " })).startsWith("Usage: /skill-search <query>"));
		assert((await run({})).startsWith("Usage: /skill-search"));
	});

	it("reports search failures", async () => {
		const { handlers, tools } = fakePi(false);
		handlers.get("before_agent_start")!({ systemPromptOptions: { skills: [{ ...top, description: undefined }] } });
		const text = (await tools.get("skill_search")!.execute("id", { query: "top" })).content[0].text;
		assert(text.startsWith("Skill search failed: "));
		handlers.get("before_agent_start")!({ systemPromptOptions: { skills: [{ ...top, get name(): string { throw "plain"; } }] } });
		assert.equal((await tools.get("skill_search")!.execute("id", { query: "top" })).content[0].text, "Skill search failed: plain");
	});
});

describe("/skill-search command", () => {
	it("notifies with a UI and prints without one", async (t) => {
		const { commands } = fakePi();
		const notes: string[] = [];
		await commands.get("skill-search")!.handler("alpha", context(notes));
		assert(notes[0].includes(" - top-skill [top-level] "));
		const logged: string[] = [];
		t.mock.method(console, "log", (text: string) => logged.push(text));
		await commands.get("skill-search")!.handler("", context([], false));
		assert(logged[0].startsWith("Usage: /skill-search"));
		const empty = { ...context(notes), getSystemPromptOptions: () => ({}) } as unknown as ExtensionContext;
		await commands.get("skill-search")!.handler("alpha", empty);
		assert(notes[1].endsWith(" - None"));
	});
});
