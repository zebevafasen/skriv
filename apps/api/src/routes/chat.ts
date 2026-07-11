import { Readable } from "node:stream";
import {
  type ChatContextSource,
  chatStreamEventSchema,
  chatThreadSchema,
  compendiumEntrySchema,
  createChatThreadInputSchema,
  sendChatMessageInputSchema,
  updateChatThreadInputSchema,
} from "@asterism/contracts";
import { discoverEntries, findMentions, normalizeEntry } from "@asterism/core";
import {
  acts,
  chapters,
  chatMessages,
  chatThreads,
  compendiumEntries,
  scenes,
  touchUpdatedAt,
  usageEvents,
} from "@asterism/db";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../context.js";
import { conflict, notFound, parseWith } from "../http.js";
import { ownsProject } from "../ownership.js";
import { getSettings } from "./settings.js";

const projectParams = z.object({ projectId: z.uuid() });
const threadParams = z.object({ id: z.uuid() });
const active = new Map<string, AbortController>();
const ndjson = (value: unknown) => `${JSON.stringify(value)}\n`;
const messageResponse = (row: typeof chatMessages.$inferSelect) => ({
  ...row,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});
const threadResponse = (
  row: typeof chatThreads.$inferSelect,
  messages?: (typeof chatMessages.$inferSelect)[],
) =>
  chatThreadSchema.parse({
    ...row,
    ...(messages ? { messages: messages.map(messageResponse) } : {}),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });

async function ownedThread(context: AppContext, userId: string, id: string) {
  const [row] = await context.db
    .select()
    .from(chatThreads)
    .where(and(eq(chatThreads.id, id), eq(chatThreads.userId, userId)))
    .limit(1);
  return row ?? null;
}

function entryContract(row: typeof compendiumEntries.$inferSelect) {
  return compendiumEntrySchema.parse({
    ...row,
    singleton: row.singletonKey !== null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

async function resolveManualContext(
  context: AppContext,
  projectId: string,
  sources: ChatContextSource[],
) {
  const actRows = await context.db
    .select()
    .from(acts)
    .where(eq(acts.projectId, projectId))
    .orderBy(asc(acts.position));
  const actIds = actRows.map((row) => row.id);
  const chapterRows = actIds.length
    ? await context.db
        .select()
        .from(chapters)
        .where(inArray(chapters.actId, actIds))
        .orderBy(asc(chapters.position))
    : [];
  const chapterIds = chapterRows.map((row) => row.id);
  const sceneRows = chapterIds.length
    ? await context.db
        .select()
        .from(scenes)
        .where(inArray(scenes.chapterId, chapterIds))
        .orderBy(asc(scenes.position))
    : [];
  const entryRows = await context.db
    .select()
    .from(compendiumEntries)
    .where(eq(compendiumEntries.projectId, projectId));
  const selectedScenes = new Set<string>();
  const selectedEntries = new Set<string>();
  const pieces: string[] = [];
  for (const source of sources) {
    if (source.kind === "manuscript")
      sceneRows.forEach((row) => {
        selectedScenes.add(row.id);
      });
    if (source.kind === "act")
      chapterRows
        .filter((row) => row.actId === source.id)
        .forEach((chapter) => {
          sceneRows
            .filter((scene) => scene.chapterId === chapter.id)
            .forEach((scene) => {
              selectedScenes.add(scene.id);
            });
        });
    if (source.kind === "chapter")
      sceneRows
        .filter((row) => row.chapterId === source.id)
        .forEach((row) => {
          selectedScenes.add(row.id);
        });
    if (source.kind === "scene") selectedScenes.add(source.id);
    if (source.kind === "compendium_all")
      entryRows.forEach((row) => {
        selectedEntries.add(row.id);
      });
    if (source.kind === "compendium_type")
      entryRows
        .filter((row) => row.typeId === source.typeId)
        .forEach((row) => {
          selectedEntries.add(row.id);
        });
    if (source.kind === "compendium_entry") selectedEntries.add(source.id);
    if (source.kind === "outline")
      pieces.push(
        `[Full Outline]\n${actRows
          .map(
            (act) =>
              `${act.title}\n${chapterRows
                .filter((c) => c.actId === act.id)
                .map(
                  (c) =>
                    `- ${c.title}\n${sceneRows
                      .filter((s) => s.chapterId === c.id)
                      .map((s) => `  - ${s.title}: ${s.metadata.summary}`)
                      .join("\n")}`,
                )
                .join("\n")}`,
          )
          .join("\n\n")}`,
      );
  }
  for (const scene of sceneRows.filter((row) => selectedScenes.has(row.id)))
    pieces.push(`[Scene: ${scene.title}]\n${scene.plainText}`);
  for (const entry of entryRows.filter((row) => selectedEntries.has(row.id)))
    pieces.push(`[Manually selected Compendium entry]\n${normalizeEntry(entryContract(entry))}`);
  return { text: pieces.join("\n\n"), entryRows, manuallySelectedEntryIds: selectedEntries };
}

async function buildMessages(
  context: AppContext,
  userId: string,
  thread: typeof chatThreads.$inferSelect,
  history: (typeof chatMessages.$inferSelect)[],
  newText: string,
) {
  const settings = await getSettings(context, userId);
  const completed = history.filter((m) => m.status === "completed");
  const older = completed.slice(0, -16);
  if (older.length > 0) {
    const unsummarized = thread.summarizedThroughMessageId
      ? older.slice(
          Math.max(0, older.findIndex((m) => m.id === thread.summarizedThroughMessageId) + 1),
        )
      : older;
    if (unsummarized.length > 0) {
      try {
        const result = await (await context.getAi(userId, settings.contextModel)).complete({
          model: settings.contextModel,
          maxOutputTokens: 2_000,
          messages: [
            {
              role: "system",
              content:
                "Update a concise factual conversation summary for future continuity. Preserve decisions, questions, corrections, and unresolved points.",
            },
            {
              role: "user",
              content: `Existing summary:\n${thread.rollingSummary || "None"}\n\nNew turns:\n${unsummarized.map((m) => `${m.role}: ${m.content}`).join("\n\n")}`,
            },
          ],
        });
        thread.rollingSummary = result.text;
        thread.summarizedThroughMessageId = older.at(-1)?.id ?? null;
        await context.db
          .update(chatThreads)
          .set({
            rollingSummary: thread.rollingSummary,
            summarizedThroughMessageId: thread.summarizedThroughMessageId,
            ...touchUpdatedAt,
          })
          .where(eq(chatThreads.id, thread.id));
        await context.db.insert(usageEvents).values({
          userId,
          projectId: thread.projectId,
          model: settings.contextModel,
          role: "chat_utility",
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
        });
      } catch {
        /* Recent turns still provide continuity if summarization is unavailable. */
      }
    }
  }
  const manual = await resolveManualContext(context, thread.projectId, thread.contextSources);
  const entries = manual.entryRows.map(entryContract);
  const recent = completed.slice(-16);
  const userScan = [...recent.filter((m) => m.role === "user").map((m) => m.content), newText].join(
    "\n",
  );
  const assistantScan = recent
    .filter((m) => m.role === "assistant")
    .map((m) => m.content)
    .join("\n");
  const forcedIds = new Set(
    findMentions(userScan, entries, { includeUntracked: true }).flatMap((m) => m.entryIds),
  );
  const automatic = discoverEntries({
    entries,
    scanText: assistantScan,
    includeSmartCandidates: settings.smartContextEnabled,
    maxDepth: settings.recursionDepth,
  });
  const automaticIds = new Set(automatic.map((item) => item.entry.id));
  const compendiumText = entries
    .filter(
      (entry) =>
        !manual.manuallySelectedEntryIds.has(entry.id) &&
        (forcedIds.has(entry.id) || automaticIds.has(entry.id)),
    )
    .map(
      (entry) =>
        `[${forcedIds.has(entry.id) ? "User-mentioned" : "Automatically activated"} Compendium entry]\n${normalizeEntry(entry)}`,
    )
    .join("\n\n");
  let contextText = [manual.text, compendiumText].filter(Boolean).join("\n\n");
  let compressed = false;
  const warnings: string[] = [];
  if (contextText.length > 48_000) {
    try {
      const result = await (await context.getAi(userId, settings.contextModel)).complete({
        model: settings.contextModel,
        maxOutputTokens: 6_000,
        messages: [
          {
            role: "system",
            content:
              "Compress the supplied story context while preserving names, source labels, concrete facts, and relationships. Do not invent facts.",
          },
          { role: "user", content: contextText },
        ],
      });
      contextText = result.text;
      compressed = true;
      await context.db.insert(usageEvents).values({
        userId,
        projectId: thread.projectId,
        model: settings.contextModel,
        role: "chat_utility",
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
      });
    } catch {
      contextText = contextText.slice(0, 48_000);
      warnings.push("Some selected context was truncated because compression failed.");
    }
  }
  const messages = [
    {
      role: "system" as const,
      content:
        "You are a project-grounded fiction assistant. Treat supplied project context as reference material, distinguish known facts from inference, and answer the user's request directly.",
    },
    ...(contextText
      ? [{ role: "developer" as const, content: `Project context:\n${contextText}` }]
      : []),
    ...(thread.rollingSummary
      ? [
          {
            role: "developer" as const,
            content: `Earlier conversation summary:\n${thread.rollingSummary}`,
          },
        ]
      : []),
    ...recent.map((m) => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: newText },
  ];
  return { messages, compressed, warnings };
}

export async function registerChatRoutes(app: FastifyInstance, context: AppContext) {
  app.get("/api/projects/:projectId/chat/threads", async (request, reply) => {
    const { projectId } = parseWith(projectParams, request.params);
    if (!(await ownsProject(context, request.userId, projectId)))
      return notFound(reply, "Project not found.");
    const rows = await context.db
      .select()
      .from(chatThreads)
      .where(and(eq(chatThreads.projectId, projectId), eq(chatThreads.userId, request.userId)))
      .orderBy(desc(chatThreads.updatedAt));
    return rows.map((row) => threadResponse(row));
  });
  app.post("/api/projects/:projectId/chat/threads", async (request, reply) => {
    const { projectId } = parseWith(projectParams, request.params);
    const input = parseWith(createChatThreadInputSchema, request.body);
    if (!(await ownsProject(context, request.userId, projectId)))
      return notFound(reply, "Project not found.");
    const [row] = await context.db
      .insert(chatThreads)
      .values({ projectId, userId: request.userId, model: input.model })
      .returning();
    return reply.code(201).send(threadResponse(row!));
  });
  app.get("/api/chat/threads/:id", async (request, reply) => {
    const { id } = parseWith(threadParams, request.params);
    const thread = await ownedThread(context, request.userId, id);
    if (!thread) return notFound(reply, "Thread not found.");
    const messages = await context.db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.threadId, id))
      .orderBy(asc(chatMessages.createdAt));
    return threadResponse(thread, messages);
  });
  app.patch("/api/chat/threads/:id", async (request, reply) => {
    const { id } = parseWith(threadParams, request.params);
    const input = parseWith(updateChatThreadInputSchema, request.body);
    if (!(await ownedThread(context, request.userId, id)))
      return notFound(reply, "Thread not found.");
    const [row] = await context.db
      .update(chatThreads)
      .set({ ...input, ...touchUpdatedAt })
      .where(eq(chatThreads.id, id))
      .returning();
    return threadResponse(row!);
  });
  app.delete("/api/chat/threads/:id", async (request, reply) => {
    const { id } = parseWith(threadParams, request.params);
    if (!(await ownedThread(context, request.userId, id)))
      return notFound(reply, "Thread not found.");
    active.get(id)?.abort();
    await context.db.delete(chatThreads).where(eq(chatThreads.id, id));
    return reply.code(204).send();
  });
  app.post("/api/chat/threads/:id/stop", async (request, reply) => {
    const { id } = parseWith(threadParams, request.params);
    if (!(await ownedThread(context, request.userId, id)))
      return notFound(reply, "Thread not found.");
    active.get(id)?.abort();
    return reply.code(204).send();
  });
  app.post(
    "/api/chat/threads/:id/messages",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const { id } = parseWith(threadParams, request.params);
      const input = parseWith(sendChatMessageInputSchema, request.body);
      const thread = await ownedThread(context, request.userId, id);
      if (!thread) return notFound(reply, "Thread not found.");
      if (active.has(id)) return conflict(reply, "A response is already streaming.");
      const history = await context.db
        .select()
        .from(chatMessages)
        .where(eq(chatMessages.threadId, id))
        .orderBy(asc(chatMessages.createdAt));
      const [userMessage] = await context.db
        .insert(chatMessages)
        .values({ threadId: id, role: "user", content: input.content, status: "completed" })
        .returning();
      const [assistantMessage] = await context.db
        .insert(chatMessages)
        .values({ threadId: id, role: "assistant", status: "streaming", model: thread.model })
        .returning();
      if (history.length === 0)
        await context.db
          .update(chatThreads)
          .set({ title: input.content.replace(/\s+/g, " ").slice(0, 80), ...touchUpdatedAt })
          .where(eq(chatThreads.id, id));
      const controller = new AbortController();
      active.set(id, controller);
      const userId = request.userId;
      async function* stream() {
        let text = "";
        yield ndjson(
          chatStreamEventSchema.parse({
            type: "chat.started",
            userMessage: messageResponse(userMessage!),
            assistantMessage: messageResponse(assistantMessage!),
          }),
        );
        try {
          const built = await buildMessages(context, userId, thread!, history, input.content);
          for await (const delta of (await context.getAi(userId, thread!.model)).stream({
            model: thread!.model,
            messages: built.messages,
            maxOutputTokens: 8_000,
            signal: controller.signal,
          })) {
            text += delta;
            yield ndjson({ type: "chat.delta", messageId: assistantMessage!.id, delta });
          }
          const outputTokens = Math.ceil(text.length / 4);
          const [done] = await context.db
            .update(chatMessages)
            .set({ content: text, status: "completed", outputTokens, ...touchUpdatedAt })
            .where(eq(chatMessages.id, assistantMessage!.id))
            .returning();
          await context.db.update(chatThreads).set(touchUpdatedAt).where(eq(chatThreads.id, id));
          await context.db.insert(usageEvents).values({
            userId,
            projectId: thread!.projectId,
            model: thread!.model,
            role: "chat",
            outputTokens,
          });
          yield ndjson(
            chatStreamEventSchema.parse({
              type: "chat.completed",
              message: messageResponse(done!),
              compressed: built.compressed,
              warnings: built.warnings,
            }),
          );
        } catch (error) {
          if (controller.signal.aborted) {
            await context.db
              .update(chatMessages)
              .set({ content: text, status: "cancelled", ...touchUpdatedAt })
              .where(eq(chatMessages.id, assistantMessage!.id));
            yield ndjson({ type: "chat.cancelled", messageId: assistantMessage!.id });
          } else {
            const message = error instanceof Error ? error.message : "Chat failed.";
            await context.db
              .update(chatMessages)
              .set({ content: text, status: "failed", failureMessage: message, ...touchUpdatedAt })
              .where(eq(chatMessages.id, assistantMessage!.id));
            yield ndjson({ type: "chat.failed", messageId: assistantMessage!.id, message });
          }
        } finally {
          active.delete(id);
        }
      }
      reply.header("Content-Type", "application/x-ndjson; charset=utf-8");
      reply.header("Cache-Control", "no-cache, no-transform");
      return reply.send(Readable.from(stream()));
    },
  );
  app.post("/api/chat/threads/:id/regenerate", async (request, reply) => {
    const { id } = parseWith(threadParams, request.params);
    const thread = await ownedThread(context, request.userId, id);
    if (!thread) return notFound(reply, "Thread not found.");
    const rows = await context.db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.threadId, id))
      .orderBy(desc(chatMessages.createdAt))
      .limit(2);
    const assistant = rows.find((m) => m.role === "assistant");
    const userMessage = rows.find((m) => m.role === "user");
    if (!assistant || !userMessage) return conflict(reply, "There is no response to regenerate.");
    await context.db.delete(chatMessages).where(eq(chatMessages.id, assistant.id));
    await context.db.delete(chatMessages).where(eq(chatMessages.id, userMessage.id));
    const result = await app.inject({
      method: "POST",
      url: `/api/chat/threads/${id}/messages`,
      payload: { content: userMessage.content },
      headers: { cookie: request.headers.cookie ?? "" },
    });
    return reply.code(result.statusCode).headers(result.headers).send(result.rawPayload);
  });
}
