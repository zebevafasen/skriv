import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerCompendiumRoutes } from "./routes/compendium.js";

vi.mock("./ownership.js", () => ({ ownsProject: vi.fn(async () => true) }));
vi.mock("./routes/settings.js", () => ({
  getSettings: vi.fn(async () => ({ baseModel: "skriv/fake-prose" })),
  getModelLimits: vi.fn(async () => ({ contextLength: 32_768, maxCompletionTokens: 4_096 })),
}));
vi.mock("./routes/prompts.js", () => ({
  resolvePrompt: vi.fn(async () => ({
    id: "test.compendium.extract",
    name: "Test extraction",
    workflow: "compendium.extract",
    version: 1,
    description: "",
    ownership: "user",
    sourcePromptId: null,
    messages: [
      {
        role: "user",
        content:
          "Existing:\n{{existing_entries}}\n<story_text>{{text}}</story_text>\nLanguage: {{story_language}}",
      },
    ],
    variables: ["existing_entries", "text", "story_language"],
    createdAt: null,
    updatedAt: null,
  })),
}));

const projectId = "10000000-0000-4000-8000-000000000001";
const existingId = "10000000-0000-4000-8000-000000000002";

function existingEntry() {
  const now = new Date("2026-01-01T00:00:00.000Z");
  return {
    id: existingId,
    projectId,
    name: "Mara",
    typeId: "story.character" as const,
    aliases: ["The Investigator"],
    labels: [],
    imageDataUrl: null,
    trackingEnabled: true,
    matchExclusions: [],
    activationMode: "mention" as const,
    caseSensitive: false,
    content: {
      kind: "rich_text" as const,
      plainText: "Existing details.",
      document: {
        type: "doc",
        content: [
          {
            type: "heading",
            attrs: { level: 2 },
            content: [{ type: "text", text: "Existing details." }],
          },
        ],
      },
    },
    revision: 3,
    singletonKey: null,
    createdAt: now,
    updatedAt: now,
  };
}

function selectRows(rows: unknown[], withLimit = false) {
  return {
    from: () => ({
      where: () => (withLimit ? { limit: async () => rows } : Promise.resolve(rows)),
    }),
  };
}

describe("Compendium extraction import routes", () => {
  let app = Fastify({ logger: false });

  beforeEach(() => {
    app = Fastify({ logger: false });
    app.decorateRequest("userId", "test-user");
  });

  afterEach(async () => {
    await app.close();
  });

  it("rejects a stale or foreign append target before opening a transaction", async () => {
    const transaction = vi.fn();
    const context = {
      db: {
        select: () => selectRows([existingEntry()]),
        transaction,
      },
    };
    await registerCompendiumRoutes(app, context as never);

    const response = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/compendium/import`,
      payload: {
        entries: [
          {
            name: "Mara",
            typeId: "story.character",
            description: "New details.",
            existingEntryId: existingId,
            expectedExistingRevision: 2,
          },
        ],
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error.details).toEqual([
      expect.objectContaining({ reason: "revision_changed" }),
    ]);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("extracts reviewable suggestions, deduplicates model output, and preserves ambiguous aliases", async () => {
    const first = existingEntry();
    first.name = "The Captain";
    first.aliases = ["Ash"];
    const second = {
      ...existingEntry(),
      id: "10000000-0000-4000-8000-000000000004",
      name: "Ash Tree",
      aliases: ["Ash"],
      revision: 5,
    };
    const selectedRows = [[{ settings: { language: "General English" } }], [first, second]];
    const complete = vi.fn(async () => ({
      text: JSON.stringify({
        entries: [
          {
            name: "Ash",
            typeId: "story.character",
            description: "A figure waiting in the scene.",
            evidence: "Ash waited.",
          },
          {
            name: "ＡＳＨ",
            typeId: "story.character",
            description: "A duplicate suggestion.",
            evidence: "Ash waited.",
          },
        ],
      }),
      usage: { inputTokens: 100, outputTokens: 50 },
    }));
    const usageValues = vi.fn(async () => []);
    let selectCount = 0;
    const context = {
      db: {
        select: () => selectRows(selectedRows.shift() ?? [], selectCount++ === 0),
        insert: () => ({ values: usageValues }),
      },
      getAi: vi.fn(async () => ({ complete })),
    };
    await registerCompendiumRoutes(app, context as never);

    const response = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/compendium/extract`,
      payload: { text: "Ash waited beside the road." },
    });

    expect(response.statusCode, response.body).toBe(200);
    const suggestions = response.json().suggestions;
    expect(suggestions).toHaveLength(1);
    expect(
      suggestions[0].duplicateCandidates.map((candidate: { id: string }) => candidate.id),
    ).toEqual([second.id, first.id]);
    expect(complete).toHaveBeenCalledWith(
      expect.objectContaining({
        maxOutputTokens: 4_000,
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: "developer",
            content: expect.stringContaining("untrusted source data"),
          }),
        ]),
      }),
    );
    expect(usageValues).toHaveBeenCalledWith(expect.objectContaining({ role: "compendium" }));
  });

  it("atomically appends rich text and creates new entries after validation", async () => {
    const existing = existingEntry();
    const updates: Array<Record<string, unknown>> = [];
    const inserts: Array<Record<string, unknown>> = [];
    const transaction = vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        update: () => ({
          set: (values: Record<string, unknown>) => {
            updates.push(values);
            return {
              where: () => ({
                returning: async () => [
                  { ...existing, ...values, updatedAt: new Date("2026-01-02T00:00:00.000Z") },
                ],
              }),
            };
          },
        }),
        insert: () => ({
          values: (values: Record<string, unknown>) => {
            inserts.push(values);
            return {
              returning: async () => [
                {
                  id: "10000000-0000-4000-8000-000000000003",
                  ...values,
                  imageDataUrl: null,
                  revision: 1,
                  singletonKey: null,
                  createdAt: new Date("2026-01-02T00:00:00.000Z"),
                  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
                },
              ],
            };
          },
        }),
      };
      return callback(tx);
    });
    const context = {
      db: {
        select: () => selectRows([existing]),
        transaction,
      },
    };
    await registerCompendiumRoutes(app, context as never);

    const response = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/compendium/import`,
      payload: {
        entries: [
          {
            name: "Mara",
            typeId: "story.character",
            description: "New details.",
            existingEntryId: existingId,
            expectedExistingRevision: 3,
          },
          {
            name: "The Archive",
            typeId: "story.location",
            description: "A sealed archive.",
            existingEntryId: null,
            expectedExistingRevision: null,
          },
        ],
      },
    });

    expect(response.statusCode).toBe(201);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(updates[0]?.content).toEqual(
      expect.objectContaining({
        plainText: "Existing details.\n\nNew details.",
        document: expect.objectContaining({
          content: [
            expect.objectContaining({ type: "heading" }),
            expect.objectContaining({ type: "paragraph" }),
          ],
        }),
      }),
    );
    expect(inserts[0]).toEqual(expect.objectContaining({ name: "The Archive" }));
    expect(response.json()).toHaveLength(2);
  });
});
