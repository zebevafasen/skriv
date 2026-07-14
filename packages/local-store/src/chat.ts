import { AppError } from "@asterism/application";
import { getBuiltinPrompt } from "@asterism/content";
import {
  createChatThreadInputSchema,
  sendChatMessageInputSchema,
  type ChatContextSource,
  type ChatMessage,
  type ChatStreamEvent,
  updateChatThreadInputSchema,
} from "@asterism/contracts";
import { protectedProtocolMessage, renderPrompt } from "@asterism/core";
import { asc, desc, eq, inArray } from "drizzle-orm";
import type { LocalDatabase } from "./database.js";
import { cancelNativeAi, streamNativeAi } from "./native-ai.js";
import {
  acts,
  chapters,
  chatMessages,
  chatThreads,
  compendiumEntries,
  projects,
  scenes,
  touchUpdatedAt,
} from "./schema.js";

function notFound(message: string): never {
  throw new AppError(message, "NOT_FOUND");
}

function conflict(message: string): never {
  throw new AppError(message, "CONFLICT");
}

function threadResponse(
  thread: typeof chatThreads.$inferSelect,
  messages?: Array<typeof chatMessages.$inferSelect>,
) {
  return { ...thread, ...(messages ? { messages } : {}) };
}

async function getThread(db: LocalDatabase, id: string) {
  const [thread] = await db.select().from(chatThreads).where(eq(chatThreads.id, id)).limit(1);
  if (!thread) notFound("Chat thread not found.");
  return thread;
}

export async function handleChatRoutes(
  db: LocalDatabase,
  method: string,
  path: string,
  body: unknown,
): Promise<unknown | null> {
  const projectThreads = path.match(/^\/api\/projects\/([0-9a-f-]+)\/chat\/threads$/i);
  if (projectThreads) {
    const projectId = projectThreads[1] as string;
    const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    if (!project) notFound("Project not found.");
    if (method === "GET") {
      const rows = await db
        .select()
        .from(chatThreads)
        .where(eq(chatThreads.projectId, projectId))
        .orderBy(desc(chatThreads.updatedAt));
      return rows.map((row) => threadResponse(row));
    }
    if (method === "POST") {
      const input = createChatThreadInputSchema.parse(body);
      const [created] = await db
        .insert(chatThreads)
        .values({
          id: crypto.randomUUID(),
          projectId,
          title: "New thread",
          model: input.model,
          contextSources: [],
        })
        .returning();
      if (!created) throw new AppError("Chat thread creation failed.", "DATABASE_ERROR");
      return threadResponse(created);
    }
  }

  const threadMatch = path.match(/^\/api\/chat\/threads\/([0-9a-f-]+)$/i);
  if (threadMatch) {
    const thread = await getThread(db, threadMatch[1] as string);
    if (method === "GET") {
      const messages = await db
        .select()
        .from(chatMessages)
        .where(eq(chatMessages.threadId, thread.id))
        .orderBy(asc(chatMessages.createdAt));
      return threadResponse(thread, messages);
    }
    if (method === "PATCH") {
      const input = updateChatThreadInputSchema.parse(body);
      const [updated] = await db
        .update(chatThreads)
        .set({ ...input, ...touchUpdatedAt })
        .where(eq(chatThreads.id, thread.id))
        .returning();
      if (!updated) throw new AppError("Chat thread update failed.", "DATABASE_ERROR");
      return threadResponse(updated);
    }
    if (method === "DELETE") {
      await cancelNativeAi(`chat:${thread.id}`);
      await db.delete(chatThreads).where(eq(chatThreads.id, thread.id));
      return undefined;
    }
  }

  const stopMatch = path.match(/^\/api\/chat\/threads\/([0-9a-f-]+)\/stop$/i);
  if (stopMatch && method === "POST") {
    const thread = await getThread(db, stopMatch[1] as string);
    await cancelNativeAi(`chat:${thread.id}`);
    return undefined;
  }

  return null;
}

async function selectedProjectContext(
  db: LocalDatabase,
  projectId: string,
  sources: ChatContextSource[],
): Promise<string> {
  if (!sources.length) return "No project context was explicitly selected.";
  const actRows = await db.select().from(acts).where(eq(acts.projectId, projectId));
  const chapterRows = actRows.length
    ? await db
        .select()
        .from(chapters)
        .where(
          inArray(
            chapters.actId,
            actRows.map((item) => item.id),
          ),
        )
    : [];
  const sceneRows = chapterRows.length
    ? await db
        .select()
        .from(scenes)
        .where(
          inArray(
            scenes.chapterId,
            chapterRows.map((item) => item.id),
          ),
        )
    : [];
  const entries = await db
    .select()
    .from(compendiumEntries)
    .where(eq(compendiumEntries.projectId, projectId));
  const sections: string[] = [];
  const addScenes = (label: string, rows: typeof sceneRows) => {
    sections.push(
      `${label}:\n${rows
        .map(
          (scene) =>
            `## ${scene.title || "Untitled Scene"}\nSummary: ${scene.metadata.summary}\n${scene.plainText}`,
        )
        .join("\n\n")}`,
    );
  };
  for (const source of sources) {
    if (source.kind === "manuscript") addScenes("Manuscript", sceneRows);
    else if (source.kind === "outline") {
      sections.push(
        `Outline:\n${actRows
          .map(
            (act) =>
              `${act.title || "Untitled Act"}\n${chapterRows
                .filter((chapter) => chapter.actId === act.id)
                .map(
                  (chapter) =>
                    `  ${chapter.title || "Untitled Chapter"}\n${sceneRows
                      .filter((scene) => scene.chapterId === chapter.id)
                      .map(
                        (scene) =>
                          `    ${scene.title || "Untitled Scene"}: ${scene.metadata.summary}`,
                      )
                      .join("\n")}`,
                )
                .join("\n")}`,
          )
          .join("\n")}`,
      );
    } else if (source.kind === "act") {
      const chapterIds = chapterRows
        .filter((chapter) => chapter.actId === source.id)
        .map((chapter) => chapter.id);
      addScenes(
        "Selected Act",
        sceneRows.filter((scene) => chapterIds.includes(scene.chapterId)),
      );
    } else if (source.kind === "chapter") {
      addScenes(
        "Selected Chapter",
        sceneRows.filter((scene) => scene.chapterId === source.id),
      );
    } else if (source.kind === "scene") {
      addScenes(
        "Selected Scene",
        sceneRows.filter((scene) => scene.id === source.id),
      );
    } else {
      const selected =
        source.kind === "compendium_all"
          ? entries
          : source.kind === "compendium_type"
            ? entries.filter((entry) => entry.typeId === source.typeId)
            : entries.filter((entry) => entry.id === source.id);
      sections.push(
        `Compendium:\n${selected
          .map((entry) => `${entry.name} (${entry.typeId}): ${JSON.stringify(entry.content)}`)
          .join("\n")}`,
      );
    }
  }
  return sections.join("\n\n").slice(0, 160_000);
}

export async function streamLocalChat(
  db: LocalDatabase,
  path: string,
  content: string | null,
  onEvent: (event: ChatStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const match = path.match(/^\/api\/chat\/threads\/([0-9a-f-]+)\/(messages|regenerate)$/i);
  if (!match) throw new AppError("Unknown chat streaming operation.", "NOT_FOUND");
  const thread = await getThread(db, match[1] as string);
  const rows = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.threadId, thread.id))
    .orderBy(asc(chatMessages.createdAt));

  let userMessage: typeof chatMessages.$inferSelect;
  let assistantMessage: typeof chatMessages.$inferSelect;
  let history = rows;
  let replacedMessageId: string | undefined;
  if (match[2] === "messages") {
    const input = sendChatMessageInputSchema.parse({ content });
    [userMessage, assistantMessage] = await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(chatMessages)
        .values({
          id: crypto.randomUUID(),
          threadId: thread.id,
          role: "user",
          content: input.content,
          status: "completed",
        })
        .returning();
      const [assistant] = await tx
        .insert(chatMessages)
        .values({
          id: crypto.randomUUID(),
          threadId: thread.id,
          role: "assistant",
          content: "",
          status: "streaming",
          model: thread.model,
        })
        .returning();
      if (!user || !assistant)
        throw new AppError("Chat message creation failed.", "DATABASE_ERROR");
      if (!rows.length) {
        await tx
          .update(chatThreads)
          .set({ title: input.content.replace(/\s+/g, " ").slice(0, 80), ...touchUpdatedAt })
          .where(eq(chatThreads.id, thread.id));
      }
      return [user, assistant];
    });
  } else {
    const assistantIndex = rows.findLastIndex((message) => message.role === "assistant");
    const oldAssistant = rows[assistantIndex];
    const oldUser = [...rows.slice(0, assistantIndex)]
      .reverse()
      .find((message) => message.role === "user");
    if (!oldAssistant || !oldUser) conflict("There is no response to regenerate.");
    userMessage = oldUser;
    replacedMessageId = oldAssistant.id;
    history = rows.slice(0, rows.indexOf(oldUser));
    const [created] = await db
      .insert(chatMessages)
      .values({
        id: crypto.randomUUID(),
        threadId: thread.id,
        role: "assistant",
        content: "",
        status: "streaming",
        model: thread.model,
      })
      .returning();
    if (!created) throw new AppError("Replacement message creation failed.", "DATABASE_ERROR");
    assistantMessage = created;
  }

  onEvent({
    type: "chat.started",
    userMessage,
    assistantMessage,
    ...(replacedMessageId ? { replacedMessageId } : {}),
  });
  const projectContext = await selectedProjectContext(db, thread.projectId, thread.contextSources);
  const prompt = getBuiltinPrompt("chat.respond");
  const promptMessages = [
    protectedProtocolMessage("chat.respond"),
    ...renderPrompt(prompt, {
      project_context: projectContext,
      conversation_summary: thread.rollingSummary,
    }),
    ...history.map((message) => ({ role: message.role, content: message.content })),
    { role: "user" as const, content: userMessage.content },
  ];
  let responseText = "";
  try {
    const completion = await streamNativeAi(
      { operationId: `chat:${thread.id}`, model: thread.model, messages: promptMessages },
      (event) => {
        responseText += event.delta;
        onEvent({ type: "chat.delta", messageId: assistantMessage.id, delta: event.delta });
      },
      signal,
    );
    const completed: ChatMessage = {
      ...assistantMessage,
      content: responseText,
      status: "completed",
    };
    await db.transaction(async (tx) => {
      await tx
        .update(chatMessages)
        .set({
          content: responseText,
          status: "completed",
          inputTokens: completion.inputTokens,
          outputTokens: completion.outputTokens,
          ...touchUpdatedAt,
        })
        .where(eq(chatMessages.id, assistantMessage.id));
      if (replacedMessageId) {
        await tx.delete(chatMessages).where(eq(chatMessages.id, replacedMessageId));
      }
      await tx.update(chatThreads).set(touchUpdatedAt).where(eq(chatThreads.id, thread.id));
    });
    onEvent({ type: "chat.completed", message: completed, compressed: false, warnings: [] });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      await db
        .update(chatMessages)
        .set({ content: responseText, status: "cancelled", ...touchUpdatedAt })
        .where(eq(chatMessages.id, assistantMessage.id));
      onEvent({ type: "chat.cancelled", messageId: assistantMessage.id });
      return;
    }
    const message = error instanceof Error ? error.message : "Chat response failed.";
    await db
      .update(chatMessages)
      .set({ content: responseText, status: "failed", failureMessage: message, ...touchUpdatedAt })
      .where(eq(chatMessages.id, assistantMessage.id));
    onEvent({ type: "chat.failed", messageId: assistantMessage.id, message });
  }
}
