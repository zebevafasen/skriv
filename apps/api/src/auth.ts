import { createHash } from "node:crypto";
import type { ServerEnv } from "@asterism/config";
import type { Database } from "@asterism/db";
import {
  account,
  invites,
  session,
  user,
  verification,
  workspaceMembers,
  workspaces,
} from "@asterism/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { and, eq, gt, isNull } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AppContext } from "./context.js";

export const DEV_USER_ID = "00000000-0000-4000-8000-000000000001";

export function createAuth(db: Database, env: ServerEnv) {
  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: { user, session, account, verification },
    }),
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.WEB_ORIGIN],
    emailAndPassword: { enabled: true },
  });
}

function requestHeaders(request: FastifyRequest): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) for (const item of value) headers.append(key, item);
    else if (value !== undefined) headers.set(key, String(value));
  }
  return headers;
}

export async function ensureDevelopmentUser(context: AppContext): Promise<void> {
  if (!context.env.DEV_AUTH_BYPASS) return;
  const existing = await context.db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.id, DEV_USER_ID))
    .limit(1);
  if (existing.length > 0) return;
  await context.db.transaction(async (tx) => {
    await tx.insert(user).values({
      id: DEV_USER_ID,
      name: "Local Writer",
      email: "writer@asterism.local",
      emailVerified: true,
    });
    const [workspace] = await tx
      .insert(workspaces)
      .values({ name: "Personal Workspace", ownerId: DEV_USER_ID })
      .returning({ id: workspaces.id });
    if (!workspace) throw new Error("Failed to create development workspace.");
    await tx
      .insert(workspaceMembers)
      .values({ workspaceId: workspace.id, userId: DEV_USER_ID, role: "owner" });
  });
}

async function ensurePersonalWorkspace(context: AppContext, userId: string): Promise<void> {
  const [membership] = await context.db
    .select({ workspaceId: workspaceMembers.workspaceId })
    .from(workspaceMembers)
    .where(eq(workspaceMembers.userId, userId))
    .limit(1);
  if (membership) return;
  await context.db.transaction(async (tx) => {
    const [workspace] = await tx
      .insert(workspaces)
      .values({ name: "Personal Workspace", ownerId: userId })
      .returning({ id: workspaces.id });
    if (!workspace) throw new Error("Failed to create personal workspace.");
    await tx.insert(workspaceMembers).values({ workspaceId: workspace.id, userId, role: "owner" });
  });
}

export async function registerAuth(app: FastifyInstance, context: AppContext): Promise<void> {
  app.route({
    method: ["GET", "POST"],
    url: "/api/auth/*",
    handler: async (request, reply) => {
      let matchedInviteId: string | null = null;
      if (
        context.env.INVITE_ONLY &&
        !context.env.DEV_AUTH_BYPASS &&
        request.method === "POST" &&
        request.url.includes("/sign-up/email")
      ) {
        const inviteToken = request.headers["x-asterism-invite-token"];
        const email =
          typeof request.body === "object" && request.body && "email" in request.body
            ? String(request.body.email).toLocaleLowerCase()
            : "";
        if (typeof inviteToken !== "string" || !email) {
          return reply
            .code(403)
            .send({ error: { code: "FORBIDDEN", message: "A valid invitation is required." } });
        }
        const tokenHash = createHash("sha256").update(inviteToken).digest("hex");
        const [invite] = await context.db
          .select()
          .from(invites)
          .where(
            and(
              eq(invites.tokenHash, tokenHash),
              eq(invites.email, email),
              isNull(invites.acceptedAt),
              gt(invites.expiresAt, new Date()),
            ),
          )
          .limit(1);
        if (!invite) {
          return reply.code(403).send({
            error: { code: "FORBIDDEN", message: "Invitation is invalid or expired." },
          });
        }
        matchedInviteId = invite.id;
      }
      const headers = requestHeaders(request);
      const url = new URL(request.url, context.env.BETTER_AUTH_URL);
      const init: RequestInit = { method: request.method, headers };
      if (request.method !== "GET" && request.body !== undefined)
        init.body = JSON.stringify(request.body);
      const response = await context.auth.handler(new Request(url, init));
      if (response.ok && matchedInviteId) {
        await context.db
          .update(invites)
          .set({ acceptedAt: new Date() })
          .where(eq(invites.id, matchedInviteId));
      }
      reply.status(response.status);
      response.headers.forEach((value, key) => {
        reply.header(key, value);
      });
      const body = await response.arrayBuffer();
      return reply.send(Buffer.from(body));
    },
  });

  app.addHook("preHandler", async (request, reply) => {
    if (
      !request.url.startsWith("/api/") ||
      request.url.startsWith("/api/auth/") ||
      request.url === "/api/internal/archive-transfers/cleanup" ||
      request.url === "/api/health"
    ) {
      return;
    }
    if (context.env.DEV_AUTH_BYPASS) {
      request.userId = DEV_USER_ID;
      return;
    }
    const sessionResult = await context.auth.api.getSession({ headers: requestHeaders(request) });
    if (!sessionResult?.user?.id) {
      return reply
        .code(401)
        .send({ error: { code: "UNAUTHORIZED", message: "Authentication required." } });
    }
    request.userId = sessionResult.user.id;
    await ensurePersonalWorkspace(context, request.userId);
  });
}
