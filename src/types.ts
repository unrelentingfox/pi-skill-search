export type SkillEntry = { name: string; description: string; filePath: string };

export type RouteEntry = { name: string; children: SkillEntry[] };

export type LocatedSkill = SkillEntry & { where: string };

export type SearchHit = LocatedSkill & { score: number; snippet?: string };

export type SearchResult = { total: number; hits: SearchHit[] };
