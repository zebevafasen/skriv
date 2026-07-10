import { createHash, randomBytes } from "node:crypto";
import { invites } from "@asterism/db";
import { desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../context.js";
import { parseWith } from "../http.js";

const createInviteSchema = z.object({
  email: z.email().transform((value) => value.toLocaleLowerCase()),
  expiresInDays: z.number().int().min(1).max(30).default(7),
});

export async function registerInviteRoutes(
  app: FastifyInstance,
  context: AppContext,
): Promise<void> {
  app.get("/api/invites", async () => {
    const rows = await context.db
      .select()
      .from(invites)
      .orderBy(desc(invites.createdAt))
      .limit(100);
    return rows.map((row) => ({
      id: row.id,
      email: row.email,
      expiresAt: row.expiresAt.toISOString(),
      acceptedAt: row.acceptedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    }));
  });

  app.post("/api/invites", async (request, reply) => {
    const input = parseWith(createInviteSchema, request.body);
    const token = randomBytes(24).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1_000);
    const [invite] = await context.db
      .insert(invites)
      .values({ email: input.email, tokenHash, expiresAt, createdBy: request.userId })
      .returning();
    return reply.code(201).send({
      id: invite?.id,
      email: input.email,
      token,
      expiresAt: expiresAt.toISOString(),
    });
  });

  app.delete("/api/invites/:id", async (request, reply) => {
    const { id } = parseWith(z.object({ id: z.uuid() }), request.params);
    await context.db.delete(invites).where(eq(invites.id, id));
    return reply.code(204).send();
  });
}
