import { z } from "zod";

export const aiSettingsSchema = z.object({
  baseModel: z.string().min(1),
  contextModel: z.string().min(1),
  smartContextEnabled: z.boolean(),
  recursionDepth: z.number().int().min(0).max(5),
});

export const updateAiSettingsInputSchema = aiSettingsSchema.partial();

export const editorFontFamilySchema = z.enum(["literary", "classic", "sans"]);
export const editorFontSizeSchema = z.union([
  z.literal(16),
  z.literal(18),
  z.literal(20),
  z.literal(22),
  z.literal(24),
]);
export const editorLineHeightSchema = z.union([
  z.literal(1.4),
  z.literal(1.6),
  z.literal(1.85),
  z.literal(2),
]);
export const editorParagraphSpacingSchema = z.union([
  z.literal(0.5),
  z.literal(0.85),
  z.literal(1.15),
  z.literal(1.5),
]);
export const editorFirstLineIndentSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(1.5),
  z.literal(2),
]);
export const editorPageWidthSchema = z.union([
  z.literal(640),
  z.literal(760),
  z.literal(920),
  z.literal(1080),
]);
export const editorTextAlignSchema = z.enum(["left", "justify", "center", "right"]);

export const editorSettingsSchema = z.object({
  fontFamily: editorFontFamilySchema.default("literary"),
  fontSize: editorFontSizeSchema.default(18),
  lineHeight: editorLineHeightSchema.default(1.85),
  paragraphSpacing: editorParagraphSpacingSchema.default(1.15),
  firstLineIndent: editorFirstLineIndentSchema.default(0),
  pageWidth: editorPageWidthSchema.default(920),
  textAlign: editorTextAlignSchema.default("left"),
});

export const updateEditorSettingsInputSchema = editorSettingsSchema.partial();
export const openRouterCredentialStatusSchema = z.object({
  configured: z.boolean(),
  source: z.enum(["keychain", "user", "server", "none"]),
  lastFour: z.string().length(4).nullable(),
});
export const updateOpenRouterCredentialSchema = z.object({
  apiKey: z.string().trim().min(10).max(500),
});

export const appThemeSchema = z.enum(["system", "light", "dark", "midnight", "ocean", "forest", "sepia"]);
export const appSettingsSchema = z.object({
  theme: appThemeSchema.default("system"),
});
export const updateAppSettingsInputSchema = appSettingsSchema.partial();

export type AiSettings = z.infer<typeof aiSettingsSchema>;
export type EditorSettings = z.infer<typeof editorSettingsSchema>;
export type AppSettings = z.infer<typeof appSettingsSchema>;
export type OpenRouterCredentialStatus = z.infer<typeof openRouterCredentialStatusSchema>;
