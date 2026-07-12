import { z } from "zod";
import { emptyTiptapDocument, tiptapDocumentSchema } from "./manuscript.js";
import { idSchema, timestampSchema } from "./primitives.js";

export const projectNoteSchema = z.object({
  id: idSchema,
  projectId: idSchema,
  title: z.string().trim().min(1).max(300),
  document: tiptapDocumentSchema,
  plainText: z.string().max(500_000),
  pinned: z.boolean(),
  version: z.number().int().positive(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export const createProjectNoteInputSchema = z.object({
  title: z.string().trim().min(1).max(300).default("Untitled Note"),
  document: tiptapDocumentSchema.default(emptyTiptapDocument),
  plainText: z.string().max(500_000).default(""),
  pinned: z.boolean().default(false),
});

export const updateProjectNoteInputSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    title: z.string().trim().min(1).max(300).optional(),
    document: tiptapDocumentSchema.optional(),
    plainText: z.string().max(500_000).optional(),
    pinned: z.boolean().optional(),
  })
  .superRefine((value, context) => {
    if (
      value.title === undefined &&
      value.document === undefined &&
      value.plainText === undefined &&
      value.pinned === undefined
    ) {
      context.addIssue({ code: "custom", message: "At least one note field must be updated." });
    }
    if ((value.document === undefined) !== (value.plainText === undefined)) {
      context.addIssue({
        code: "custom",
        path: ["document"],
        message: "Note document and plain text must be updated together.",
      });
    }
  });

export type ProjectNote = z.infer<typeof projectNoteSchema>;
