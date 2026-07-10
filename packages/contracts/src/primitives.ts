import { z } from "zod";

export const idSchema = z.uuid();
export const timestampSchema = z.iso.datetime();

export const apiErrorCodeSchema = z.enum([
  "BAD_REQUEST",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "VALIDATION_ERROR",
  "RATE_LIMITED",
  "PROVIDER_ERROR",
  "INTERNAL_ERROR",
]);

export const apiErrorSchema = z.object({
  error: z.object({
    code: apiErrorCodeSchema,
    message: z.string(),
    details: z.unknown().optional(),
    requestId: z.string().optional(),
  }),
});

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
});

export type ApiError = z.infer<typeof apiErrorSchema>;
