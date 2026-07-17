import { z } from "zod";
import {
  compendiumEntrySchema,
  extractedCompendiumDraftSchema,
  extractedCompendiumSuggestionSchema,
} from "./compendium.js";
import { idSchema } from "./primitives.js";

export const extractCompendiumInputSchema = z.object({
  modelOverride: z.string().min(1).nullable().default(null),
});

export const extractCompendiumResponseSchema = z.object({
  sourcePremiseRevision: z.number().int().positive(),
  suggestions: z.array(extractedCompendiumSuggestionSchema).max(30),
  model: z.string(),
  promptId: z.string(),
});

export const importExtractedCompendiumInputSchema = z
  .object({
    sourcePremiseRevision: z.number().int().positive(),
    entries: z
      .array(
        extractedCompendiumDraftSchema.omit({ evidence: true }).extend({
          existingEntryId: idSchema.nullable().default(null),
          expectedExistingRevision: z.number().int().positive().nullable().default(null),
        }),
      )
      .min(1)
      .max(30),
  })
  .superRefine((value, context) => {
    value.entries.forEach((entry, index) => {
      if (Boolean(entry.existingEntryId) !== Boolean(entry.expectedExistingRevision)) {
        context.addIssue({
          code: "custom",
          path: ["entries", index, "existingEntryId"],
          message: "Existing entry id and revision must be supplied together.",
        });
      }
    });
  });

export const importExtractedCompendiumResponseSchema = z.array(compendiumEntrySchema);

export type ExtractedCompendiumDraft = z.infer<typeof extractedCompendiumDraftSchema>;
export type ExtractCompendiumResponse = z.infer<typeof extractCompendiumResponseSchema>;
export type ImportExtractedCompendiumInput = z.infer<typeof importExtractedCompendiumInputSchema>;
