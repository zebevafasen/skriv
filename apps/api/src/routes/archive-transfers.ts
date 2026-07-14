import {
  MAX_ARCHIVE_UNCOMPRESSED_BYTES,
  decodeProjectArchive,
  encodeProjectArchive,
} from "@asterism/application";
import { archiveTransfers } from "@asterism/db";
import { del, get, issueSignedToken, list, presignUrl, put } from "@vercel/blob";
import { and, eq, inArray, lt, or } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../context.js";
import { notFound, parseWith } from "../http.js";
import { ownsProject } from "../ownership.js";
import { importHostedProjectArchive, loadHostedProjectArchive } from "../archives/hosted-project.js";

const transferParams = z.object({ id: z.uuid() });
const exportParams = z.object({ id: z.uuid() });
const lifetime = 15 * 60 * 1_000;

function blobOptions(context: AppContext) {
  return context.env.BLOB_READ_WRITE_TOKEN ? { token: context.env.BLOB_READ_WRITE_TOKEN } : {};
}

async function signedUrl(
  context: AppContext,
  pathname: string,
  operation: "get" | "put",
  validUntil: number,
) {
  const token = await issueSignedToken({
    pathname,
    operations: [operation],
    validUntil,
    ...(operation === "put"
      ? {
          allowedContentTypes: ["application/vnd.asterism.project+zip", "application/zip"],
          maximumSizeInBytes: MAX_ARCHIVE_UNCOMPRESSED_BYTES,
        }
      : {}),
    ...blobOptions(context),
  });
  return presignUrl(token, {
    access: "private",
    pathname,
    operation,
    validUntil,
    ...(operation === "put"
      ? {
          allowedContentTypes: ["application/vnd.asterism.project+zip", "application/zip"],
          maximumSizeInBytes: MAX_ARCHIVE_UNCOMPRESSED_BYTES,
          allowOverwrite: false,
        }
      : {}),
  });
}

export async function cleanupArchiveTransfers(context: AppContext): Promise<number> {
  const now = new Date();
  const stale = new Date(Date.now() - 24 * 60 * 60 * 1_000);
  const removedPaths = new Set<string>();
  const rows = await context.db
    .select()
    .from(archiveTransfers)
    .where(or(lt(archiveTransfers.expiresAt, now), lt(archiveTransfers.createdAt, stale)));
  for (const row of rows) {
    await del(row.pathname, blobOptions(context)).catch(() => undefined);
    removedPaths.add(row.pathname);
  }
  if (rows.length)
    await context.db.delete(archiveTransfers).where(inArray(archiveTransfers.id, rows.map((row) => row.id)));

  let cursor: string | undefined;
  do {
    const page = await list({
      prefix: "archive-transfers/",
      ...(cursor ? { cursor } : {}),
      ...blobOptions(context),
    });
    for (const blob of page.blobs) {
      if (blob.uploadedAt >= stale) continue;
      await del(blob.pathname, blobOptions(context)).catch(() => undefined);
      removedPaths.add(blob.pathname);
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);

  return removedPaths.size;
}

export async function registerArchiveTransferRoutes(
  app: FastifyInstance,
  context: AppContext,
): Promise<void> {
  app.post("/api/archive-transfers/import", async (request, reply) => {
    const id = crypto.randomUUID();
    const pathname = `archive-transfers/${request.userId}/${id}.asterism`;
    const validUntil = Date.now() + lifetime;
    await context.db.insert(archiveTransfers).values({
      id,
      userId: request.userId,
      kind: "import",
      pathname,
      expiresAt: new Date(validUntil),
    });
    const { presignedUrl } = await signedUrl(context, pathname, "put", validUntil);
    return reply.code(201).send({ transferId: id, uploadUrl: presignedUrl, expiresAt: new Date(validUntil).toISOString() });
  });

  app.post("/api/archive-transfers/:id/import", async (request, reply) => {
    const { id } = parseWith(transferParams, request.params);
    const [transfer] = await context.db.select().from(archiveTransfers).where(and(
      eq(archiveTransfers.id, id),
      eq(archiveTransfers.userId, request.userId),
      eq(archiveTransfers.kind, "import"),
    )).limit(1);
    if (!transfer || transfer.expiresAt.getTime() <= Date.now()) return notFound(reply, "Archive transfer not found.");
    try {
      const result = await get(transfer.pathname, { access: "private", useCache: false, ...blobOptions(context) });
      if (result?.statusCode !== 200) return notFound(reply, "Uploaded archive not found.");
      if (result.blob.size > MAX_ARCHIVE_UNCOMPRESSED_BYTES)
        return reply.code(413).send({ error: { code: "VALIDATION_ERROR", message: "Archive exceeds 250 MiB." } });
      const decoded = await decodeProjectArchive(new Uint8Array(await new Response(result.stream).arrayBuffer()));
      const imported = await importHostedProjectArchive(context, request.userId, decoded.project, decoded.assets);
      return reply.code(201).send(imported);
    } finally {
      await del(transfer.pathname, blobOptions(context)).catch(() => undefined);
      await context.db.delete(archiveTransfers).where(eq(archiveTransfers.id, transfer.id));
    }
  });

  app.post("/api/projects/:id/archive-transfers/export", async (request, reply) => {
    const { id: projectId } = parseWith(exportParams, request.params);
    if (!(await ownsProject(context, request.userId, projectId))) return notFound(reply, "Project not found.");
    const loaded = await loadHostedProjectArchive(context, projectId);
    if (!loaded) return notFound(reply, "Project not found.");
    const id = crypto.randomUUID();
    const pathname = `archive-transfers/${request.userId}/${id}.asterism`;
    const validUntil = Date.now() + lifetime;
    const bytes = await encodeProjectArchive(loaded.project, loaded.assets, "web-0.1.0");
    await put(pathname, Buffer.from(bytes), {
      access: "private",
      contentType: "application/vnd.asterism.project+zip",
      cacheControlMaxAge: 60,
      ...blobOptions(context),
    });
    await context.db.insert(archiveTransfers).values({
      id,
      userId: request.userId,
      kind: "export",
      pathname,
      expiresAt: new Date(validUntil),
    });
    const { presignedUrl } = await signedUrl(context, pathname, "get", validUntil);
    return reply.code(201).send({
      transferId: id,
      downloadUrl: presignedUrl,
      filename: `${loaded.project.project.title.replace(/[^a-z0-9_-]+/gi, "-") || "asterism-story"}.asterism`,
      expiresAt: new Date(validUntil).toISOString(),
    });
  });

  app.get("/api/internal/archive-transfers/cleanup", async (request, reply) => {
    const expected = context.env.CRON_SECRET;
    if (!expected || request.headers.authorization !== `Bearer ${expected}`)
      return reply.code(403).send({ error: { code: "FORBIDDEN", message: "Cleanup authorization failed." } });
    return { removed: await cleanupArchiveTransfers(context) };
  });
}
