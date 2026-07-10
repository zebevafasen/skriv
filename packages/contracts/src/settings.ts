import { z } from "zod";

export const aiSettingsSchema = z.object({
  baseModel: z.string().min(1),
  contextModel: z.string().min(1),
  smartContextEnabled: z.boolean(),
  recursionDepth: z.number().int().min(0).max(5),
});

export const updateAiSettingsInputSchema = aiSettingsSchema.partial();
export const openRouterCredentialStatusSchema = z.object({
  configured: z.boolean(),
  source: z.enum(["user", "server", "none"]),
  lastFour: z.string().length(4).nullable(),
});
export const updateOpenRouterCredentialSchema = z.object({
  apiKey: z.string().trim().min(10).max(500),
});
export type AiSettings = z.infer<typeof aiSettingsSchema>;
export type OpenRouterCredentialStatus = z.infer<typeof openRouterCredentialStatusSchema>;
