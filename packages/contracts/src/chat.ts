import { z } from "zod";
import { idSchema } from "./primitives.js";

export const chatContextSourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("manuscript") }),
  z.object({ kind: z.literal("outline") }),
  z.object({ kind: z.literal("act"), id: idSchema }),
  z.object({ kind: z.literal("chapter"), id: idSchema }),
  z.object({ kind: z.literal("scene"), id: idSchema }),
  z.object({ kind: z.literal("compendium_all") }),
  z.object({ kind: z.literal("compendium_type"), typeId: z.string().min(1) }),
  z.object({ kind: z.literal("compendium_entry"), id: idSchema }),
]);

export const chatMessageSchema = z.object({
  id: idSchema,
  threadId: idSchema,
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  status: z.enum(["streaming", "completed", "cancelled", "failed"]),
  model: z.string().nullable(),
  failureMessage: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const chatThreadSchema = z.object({
  id: idSchema,
  projectId: idSchema,
  title: z.string(),
  model: z.string(),
  contextSources: z.array(chatContextSourceSchema),
  rollingSummary: z.string(),
  messages: z.array(chatMessageSchema).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createChatThreadInputSchema = z.object({ model: z.string().min(1) });
export const updateChatThreadInputSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  model: z.string().min(1).optional(),
  contextSources: z.array(chatContextSourceSchema).max(500).optional(),
});
export const sendChatMessageInputSchema = z.object({
  content: z.string().trim().min(1).max(50_000),
});
export const chatStreamEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("chat.started"),
    userMessage: chatMessageSchema,
    assistantMessage: chatMessageSchema,
  }),
  z.object({ type: z.literal("chat.delta"), messageId: idSchema, delta: z.string() }),
  z.object({
    type: z.literal("chat.completed"),
    message: chatMessageSchema,
    compressed: z.boolean(),
    warnings: z.array(z.string()),
  }),
  z.object({ type: z.literal("chat.cancelled"), messageId: idSchema }),
  z.object({ type: z.literal("chat.failed"), messageId: idSchema, message: z.string() }),
]);

export type ChatContextSource = z.infer<typeof chatContextSourceSchema>;
export type ChatMessage = z.infer<typeof chatMessageSchema>;
export type ChatThread = z.infer<typeof chatThreadSchema>;
export type ChatStreamEvent = z.infer<typeof chatStreamEventSchema>;
