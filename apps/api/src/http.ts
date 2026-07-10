import type { FastifyReply } from "fastify";
import type { ZodType } from "zod";

export function parseWith<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    const error = new Error("Request validation failed.") as Error & {
      statusCode: number;
      details: unknown;
    };
    error.statusCode = 400;
    error.details = result.error.flatten();
    throw error;
  }
  return result.data;
}

export function notFound(reply: FastifyReply, message = "Resource not found.") {
  return reply.code(404).send({ error: { code: "NOT_FOUND", message } });
}

export function conflict(reply: FastifyReply, message: string, details?: unknown) {
  return reply.code(409).send({ error: { code: "CONFLICT", message, details } });
}
