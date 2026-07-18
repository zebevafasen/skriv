import { Readable } from "node:stream";
import {
  type ChatContextSource,
  chatStreamEventSchema,
  chatThreadSchema,
  compendiumEntrySchema,
  createChatThreadInputSchema,
  sendChatMessageInputSchema,
  updateChatThreadInputSchema,
} from "@skriv/contracts";
import {
  approximateTokens,
  discoverEntries,
  discoverReferences,
  formatManuscriptLabel,
  normalizeEntry,
  renderPrompt,
} from "@skriv/core";
import {
  acts,
  chapters,
  chatMessages,
  chatThreads,
  compendiumEntries,
  scenes,
  touchUpdatedAt,
  usageEvents,
} from "@skriv/db";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { type ChatContextPiece, chatTokenBudget, selectChatContext } from "../chat-context.js";
import type { AppContext } from "../context.js";
import { conflict, notFound, parseWith, serializeNdjson } from "../http.js";
import { ownsProject } from "../ownership.js";
import { resolvePrompt } from "./prompts.js";
import { getModelContextLength, getSettings } from "./settings.js";

const projectParams = z.object({ projectId: z.uuid() });
const threadParams = z.object({ id: z.uuid() });
const active = new Map<string, AbortController>();
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
  const chapterRowsRaw = actIds.length
    ? await context.db
        .select()
        .from(chapters)
        .where(inArray(chapters.actId, actIds))
        .orderBy(asc(chapters.position))
    : [];
  const chapterRows = actRows.flatMap((act) =>
    chapterRowsRaw.filter((chapter) => chapter.actId === act.id),
  );
  const chapterIds = chapterRows.map((row) => row.id);
  const sceneRowsRaw = chapterIds.length
    ? await context.db
        .select()
        .from(scenes)
        .where(inArray(scenes.chapterId, chapterIds))
        .orderBy(asc(scenes.position))
    : [];
  const sceneRows = chapterRows.flatMap((chapter) =>
    sceneRowsRaw.filter((scene) => scene.chapterId === chapter.id),
  );
  const actLabels = new Map(
    actRows.map((act, index) => [act.id, formatManuscriptLabel("Act", index + 1, act.title)]),
  );
  const chapterLabels = new Map(
    chapterRows.map((chapter, index) => [
      chapter.id,
      formatManuscriptLabel("Chapter", index + 1, chapter.title),
    ]),
  );
  const sceneLabels = new Map(
    sceneRows.map((scene, index) => [
      scene.id,
      formatManuscriptLabel("Scene", index + 1, scene.title),
    ]),
  );
  const entryRows = (
    await context.db
      .select()
      .from(compendiumEntries)
      .where(eq(compendiumEntries.projectId, projectId))
  ).filter((entry) => entry.typeId !== "project.instructions");
  const selectedScenes = new Set<string>();
  const selectedEntries = new Set<string>();
  const pieces: ChatContextPiece[] = [];
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
      pieces.push({
        key: "outline:full",
        priority: 850,
        provenance: { reason: "explicit", source: "Full outline", depth: 0 },
        text: `[Full Outline]\n${actRows
          .map(
            (act) =>
              `${actLabels.get(act.id)}\n${chapterRows
                .filter((c) => c.actId === act.id)
                .map(
                  (c) =>
                    `- ${chapterLabels.get(c.id)}\n${sceneRows
                      .filter((s) => s.chapterId === c.id)
                      .map((s) => `  - ${sceneLabels.get(s.id)}: ${s.metadata.summary}`)
                      .join("\n")}`,
                )
                .join("\n")}`,
          )
          .join("\n\n")}`,
      });
  }
  for (const scene of sceneRows.filter((row) => selectedScenes.has(row.id)))
    pieces.push({
      key: `scene:${scene.id}`,
      priority: 900,
      provenance: { reason: "explicit", source: sceneLabels.get(scene.id) ?? "Scene", depth: 0 },
      text: `[${sceneLabels.get(scene.id) ?? "Scene"}]\n${scene.plainText}`,
    });
  for (const entry of entryRows.filter((row) => selectedEntries.has(row.id)))
    pieces.push({
      key: `entry:${entry.id}`,
      priority: 1_000,
      provenance: { reason: "explicit", source: `Compendium: ${entry.name}`, depth: 0 },
      text: `[Manually selected Compendium entry]\n${normalizeEntry(entryContract(entry))}`,
    });
  return { pieces, entryRows, manuallySelectedEntryIds: selectedEntries };
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
        const summaryPrompt = await resolvePrompt(context, userId, "chat.summarize_history");
        const result = await (await context.getAi(userId, settings.contextModel)).complete({
          model: settings.contextModel,
          maxOutputTokens: 2_000,
          messages: renderPrompt(summaryPrompt, {
            existing_summary: thread.rollingSummary || "None",
            new_messages: unsummarized.map((m) => `${m.role}: ${m.content}`).join("\n\n"),
          }),
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
  const userReferences = discoverReferences({
    entries,
    scanText: userScan,
    maxDepth: settings.recursionDepth,
  });
  const userReferenceIds = new Set(userReferences.map((reference) => reference.entry.id));
  const directUserIds = new Set(
    userReferences
      .filter((reference) => reference.recursionDepth === 0)
      .map((reference) => reference.entry.id),
  );
  const canonicalText = manual.pieces.map((piece) => piece.text).join("\n\n");
  const automatic = discoverEntries({
    entries,
    scanText: `${userScan}\n${canonicalText}`,
    includeSmartCandidates: false,
    maxDepth: settings.recursionDepth,
  });
  const automaticIds = new Set(automatic.map((item) => item.entry.id));
  const assistantMatches = new Set(
    discoverReferences({ entries, scanText: assistantScan, maxDepth: 0 }).map(
      (reference) => reference.entry.id,
    ),
  );
  const compendiumPieces: ChatContextPiece[] = entries
    .filter(
      (entry) =>
        !manual.manuallySelectedEntryIds.has(entry.id) &&
        (userReferenceIds.has(entry.id) || automaticIds.has(entry.id)),
    )
    .map((entry) => {
      const discovered = automatic.find((item) => item.entry.id === entry.id);
      const userMentioned = directUserIds.has(entry.id);
      const userReference = userReferences.find((reference) => reference.entry.id === entry.id);
      const userReferenced = Boolean(userReference);
      const corroborated =
        assistantMatches.has(entry.id) && (userMentioned || automaticIds.has(entry.id));
      return {
        key: `entry:${entry.id}`,
        priority: (userMentioned ? 800 : 650) + (corroborated ? 10 : 0),
        provenance: {
          reason: userMentioned
            ? "user_mention"
            : userReferenced
              ? "recursive"
              : discovered?.activationSource === "always"
                ? "always"
                : "recursive",
          source: userReferenced
            ? "Current or previous user message via Compendium reference"
            : "Canonical selected context",
          depth: userReference?.recursionDepth ?? discovered?.recursionDepth ?? 0,
        },
        text: `[${userMentioned ? "User-mentioned" : "Automatically activated"} Compendium entry]\n${normalizeEntry(entry)}`,
      } satisfies ChatContextPiece;
    });
  const contextPieces = [...manual.pieces, ...compendiumPieces];
  let compressed = false;
  const warnings: string[] = [];
  const contextLength = await getModelContextLength(context, userId, thread.model);
  const budget = chatTokenBudget(contextLength);
  const responsePrompt = await resolvePrompt(context, userId, "chat.respond");
  const summaryText = thread.rollingSummary.slice(0, Math.floor(budget.inputTokens * 0.2) * 4);
  const promptWithoutHistory = renderPrompt(responsePrompt, {
    project_context: "",
    conversation_summary: summaryText,
  });
  const currentUserMessage = { role: "user" as const, content: newText };
  const mandatoryTokens = [...promptWithoutHistory, currentUserMessage].reduce(
    (sum, message) => sum + approximateTokens(message.content) + 8,
    0,
  );
  let historyTokens = 0;
  const recentMessages = recent
    .slice()
    .reverse()
    .flatMap((message) => {
      const cost = approximateTokens(message.content) + 8;
      if (mandatoryTokens + historyTokens + cost > budget.inputTokens) return [];
      historyTokens += cost;
      return [{ role: message.role, content: message.content }];
    })
    .reverse();
  const fixedMessages = [...promptWithoutHistory, ...recentMessages, currentUserMessage];
  const fixedTokens = fixedMessages.reduce(
    (sum, message) => sum + approximateTokens(message.content) + 8,
    0,
  );
  const projectBudget = Math.max(0, budget.inputTokens - fixedTokens);
  const oversizedThreshold = Math.max(1_000, Math.floor(projectBudget / 2));
  const compressionPrompt = await resolvePrompt(context, userId, "chat.compress_context");
  for (const piece of contextPieces) {
    if (approximateTokens(piece.text) <= oversizedThreshold || projectBudget === 0) continue;
    try {
      const result = await (await context.getAi(userId, settings.contextModel)).complete({
        model: settings.contextModel,
        maxOutputTokens: Math.min(2_000, oversizedThreshold),
        messages: renderPrompt(compressionPrompt, {
          project_context: piece.text,
          target_budget: String(oversizedThreshold),
        }),
      });
      piece.text = result.text;
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
      piece.text = piece.text.slice(0, oversizedThreshold * 4);
      warnings.push(
        `Context from ${piece.provenance.source} was truncated after compression failed.`,
      );
    }
  }
  const selected = selectChatContext(contextPieces, projectBudget);
  if (selected.dropped > 0)
    warnings.push(
      `${selected.dropped} lower-priority context source${selected.dropped === 1 ? " was" : "s were"} omitted to fit the selected model.`,
    );
  const contextText = selected.selected.map((piece) => piece.text).join("\n\n");
  const messages = [
    ...renderPrompt(responsePrompt, {
      project_context: contextText || "No project context was selected.",
      conversation_summary: summaryText || "None",
    }),
    ...recentMessages,
    currentUserMessage,
  ];
  return { messages, compressed, warnings, maxOutputTokens: budget.outputTokens };
}

function requireRow<T>(row: T | undefined, message: string): T {
  if (!row) throw new Error(message);
  return row;
}

function sendChatStream(
  context: AppContext,
  reply: FastifyReply,
  options: {
    id: string;
    userId: string;
    thread: typeof chatThreads.$inferSelect;
    history: (typeof chatMessages.$inferSelect)[];
    content: string;
    userMessage: typeof chatMessages.$inferSelect;
    assistantMessage: typeof chatMessages.$inferSelect;
    replacedMessageId?: string;
  },
) {
  const controller = new AbortController();
  active.set(options.id, controller);
  reply.raw.once("close", () => controller.abort());
  async function* stream() {
    let text = "";
    yield serializeNdjson(
      chatStreamEventSchema.parse({
        type: "chat.started",
        userMessage: messageResponse(options.userMessage),
        assistantMessage: messageResponse(options.assistantMessage),
        ...(options.replacedMessageId ? { replacedMessageId: options.replacedMessageId } : {}),
      }),
    );
    try {
      const built = await buildMessages(
        context,
        options.userId,
        options.thread,
        options.history,
        options.content,
      );
      for await (const chunk of (await context.getAi(options.userId, options.thread.model)).stream({
        model: options.thread.model,
        messages: built.messages,
        maxOutputTokens: built.maxOutputTokens,
        signal: controller.signal,
      })) {
        if (!chunk.text) continue;
        text += chunk.text;
        yield serializeNdjson({
          type: "chat.delta",
          messageId: options.assistantMessage.id,
          delta: chunk.text,
        });
      }
      const outputTokens = approximateTokens(text);
      const [updated] = await context.db
        .update(chatMessages)
        .set({ content: text, status: "completed", outputTokens, ...touchUpdatedAt })
        .where(eq(chatMessages.id, options.assistantMessage.id))
        .returning();
      const done = requireRow(updated, "Completed Chat message could not be loaded.");
      if (options.replacedMessageId)
        await context.db.delete(chatMessages).where(eq(chatMessages.id, options.replacedMessageId));
      await context.db
        .update(chatThreads)
        .set(touchUpdatedAt)
        .where(eq(chatThreads.id, options.id));
      await context.db.insert(usageEvents).values({
        userId: options.userId,
        projectId: options.thread.projectId,
        model: options.thread.model,
        role: "chat",
        outputTokens,
      });
      yield serializeNdjson(
        chatStreamEventSchema.parse({
          type: "chat.completed",
          message: messageResponse(done),
          compressed: built.compressed,
          warnings: built.warnings,
        }),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Chat failed.";
      if (options.replacedMessageId) {
        await context.db
          .delete(chatMessages)
          .where(eq(chatMessages.id, options.assistantMessage.id));
      } else {
        await context.db
          .update(chatMessages)
          .set({
            content: text,
            status: controller.signal.aborted ? "cancelled" : "failed",
            ...(controller.signal.aborted ? {} : { failureMessage: message }),
            ...touchUpdatedAt,
          })
          .where(eq(chatMessages.id, options.assistantMessage.id));
      }
      yield serializeNdjson(
        controller.signal.aborted
          ? { type: "chat.cancelled", messageId: options.assistantMessage.id }
          : { type: "chat.failed", messageId: options.assistantMessage.id, message },
      );
    } finally {
      active.delete(options.id);
    }
  }
  reply.header("Content-Type", "application/x-ndjson; charset=utf-8");
  reply.header("Cache-Control", "no-cache, no-transform");
  return reply.send(Readable.from(stream()));
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
    return reply
      .code(201)
      .send(threadResponse(requireRow(row, "Created thread was not returned.")));
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
    return threadResponse(requireRow(row, "Updated thread was not returned."));
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
      const [insertedUser] = await context.db
        .insert(chatMessages)
        .values({ threadId: id, role: "user", content: input.content, status: "completed" })
        .returning();
      const [insertedAssistant] = await context.db
        .insert(chatMessages)
        .values({ threadId: id, role: "assistant", status: "streaming", model: thread.model })
        .returning();
      if (history.length === 0)
        await context.db
          .update(chatThreads)
          .set({ title: input.content.replace(/\s+/g, " ").slice(0, 80), ...touchUpdatedAt })
          .where(eq(chatThreads.id, id));
      return sendChatStream(context, reply, {
        id,
        userId: request.userId,
        thread,
        history,
        content: input.content,
        userMessage: requireRow(insertedUser, "Created user message was not returned."),
        assistantMessage: requireRow(
          insertedAssistant,
          "Created assistant message was not returned.",
        ),
      });
    },
  );
  app.post(
    "/api/chat/threads/:id/regenerate",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const { id } = parseWith(threadParams, request.params);
      const thread = await ownedThread(context, request.userId, id);
      if (!thread) return notFound(reply, "Thread not found.");
      if (active.has(id)) return conflict(reply, "A response is already streaming.");
      const rows = await context.db
        .select()
        .from(chatMessages)
        .where(eq(chatMessages.threadId, id))
        .orderBy(asc(chatMessages.createdAt));
      const assistantIndex = rows.findLastIndex((message) => message.role === "assistant");
      const assistant = rows[assistantIndex];
      const userMessage = [...rows.slice(0, assistantIndex)]
        .reverse()
        .find((m) => m.role === "user");
      if (!assistant || !userMessage) return conflict(reply, "There is no response to regenerate.");
      const history = rows.slice(0, rows.indexOf(userMessage));
      const [insertedAssistant] = await context.db
        .insert(chatMessages)
        .values({ threadId: id, role: "assistant", status: "streaming", model: thread.model })
        .returning();
      return sendChatStream(context, reply, {
        id,
        userId: request.userId,
        thread,
        history,
        content: userMessage.content,
        userMessage,
        assistantMessage: requireRow(
          insertedAssistant,
          "Replacement assistant message was not returned.",
        ),
        replacedMessageId: assistant.id,
      });
    },
  );
}
