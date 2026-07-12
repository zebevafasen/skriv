import { manuscriptExportOptionsSchema, type TiptapNode } from "@asterism/contracts";
import {
  acts,
  chapters,
  compendiumCategories,
  compendiumEntries,
  projectNotes,
  projects,
  projectTagPacks,
  scenes,
} from "@asterism/db";
import { AlignmentType, Document, HeadingLevel, Packer, PageBreak, Paragraph, TextRun } from "docx";
import { asc, desc, eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { z } from "zod";
import type { AppContext } from "../context.js";
import { notFound, parseWith } from "../http.js";
import { ownsProject } from "../ownership.js";

const paramsSchema = z.object({ id: z.uuid() });
type ExportRows = Awaited<ReturnType<typeof loadProject>>;
type Run = { text: string; bold?: boolean; italic?: boolean };
type SceneProjection = { title: string; blocks: Run[][] };

function safeFilename(title: string) {
  return (
    title
      .normalize("NFKD")
      .replace(/[^a-z0-9_-]+/gi, "-")
      .replace(/^-|-$/g, "")
      .toLocaleLowerCase() || "asterism-story"
  );
}

async function loadProject(context: AppContext, id: string) {
  const [project] = await context.db.select().from(projects).where(eq(projects.id, id)).limit(1);
  if (!project) return null;
  const actRows = await context.db
    .select()
    .from(acts)
    .where(eq(acts.projectId, id))
    .orderBy(asc(acts.position));
  const chapterRows = actRows.length
    ? await context.db
        .select()
        .from(chapters)
        .where(
          inArray(
            chapters.actId,
            actRows.map((row) => row.id),
          ),
        )
        .orderBy(asc(chapters.position))
    : [];
  const sceneRows = chapterRows.length
    ? await context.db
        .select()
        .from(scenes)
        .where(
          inArray(
            scenes.chapterId,
            chapterRows.map((row) => row.id),
          ),
        )
        .orderBy(asc(scenes.position))
    : [];
  const entries = await context.db
    .select()
    .from(compendiumEntries)
    .where(eq(compendiumEntries.projectId, id));
  const categories = await context.db
    .select()
    .from(compendiumCategories)
    .where(eq(compendiumCategories.projectId, id))
    .orderBy(asc(compendiumCategories.position));
  const notes = await context.db
    .select()
    .from(projectNotes)
    .where(eq(projectNotes.projectId, id))
    .orderBy(desc(projectNotes.pinned), desc(projectNotes.updatedAt));
  const importedTagPacks = await context.db
    .select()
    .from(projectTagPacks)
    .where(eq(projectTagPacks.projectId, id));
  return { project, actRows, chapterRows, sceneRows, entries, categories, notes, importedTagPacks };
}

function jsonPayload(rows: NonNullable<ExportRows>) {
  return {
    schemaVersion: 4,
    exportedAt: new Date().toISOString(),
    project: rows.project,
    manuscript: rows.actRows.map((act) => ({
      ...act,
      chapters: rows.chapterRows
        .filter((chapter) => chapter.actId === act.id)
        .map((chapter) => ({
          ...chapter,
          scenes: rows.sceneRows.filter((scene) => scene.chapterId === chapter.id),
        })),
    })),
    compendiumCategories: rows.categories,
    compendium: rows.entries,
    notes: rows.notes,
    projectTagPacks: rows.importedTagPacks,
  };
}

function inlineRuns(node: TiptapNode): Run[] {
  if (node.text !== undefined) {
    const bold = node.marks?.some((mark) => mark.type === "bold") ?? false;
    const italic = node.marks?.some((mark) => mark.type === "italic") ?? false;
    return [
      { text: node.text, ...(bold ? { bold: true } : {}), ...(italic ? { italic: true } : {}) },
    ];
  }
  return (node.content ?? []).filter((child) => child.type !== "sceneBeat").flatMap(inlineRuns);
}

function sceneBlocks(document: TiptapNode): Run[][] {
  const blocks: Run[][] = [];
  const visit = (node: TiptapNode) => {
    if (node.type === "sceneBeat") return;
    if (["paragraph", "heading", "blockquote", "codeBlock"].includes(node.type ?? "")) {
      blocks.push(inlineRuns(node));
      return;
    }
    if (node.type === "listItem") {
      const runs = inlineRuns(node);
      blocks.push([{ text: "• " }, ...runs]);
      return;
    }
    for (const child of node.content ?? []) visit(child);
  };
  visit(document);
  return blocks;
}

function projection(rows: NonNullable<ExportRows>, includeEmpty: boolean) {
  return rows.actRows
    .map((act) => ({
      title: act.title,
      chapters: rows.chapterRows
        .filter((chapter) => chapter.actId === act.id)
        .map((chapter) => ({
          title: chapter.title,
          scenes: rows.sceneRows
            .filter((scene) => scene.chapterId === chapter.id)
            .map(
              (scene): SceneProjection => ({
                title: scene.title,
                blocks: sceneBlocks(scene.document),
              }),
            )
            .filter(
              (scene) =>
                includeEmpty || scene.blocks.some((block) => block.some((run) => run.text.trim())),
            ),
        }))
        .filter((chapter) => includeEmpty || chapter.scenes.length > 0),
    }))
    .filter((act) => includeEmpty || act.chapters.length > 0);
}

function numbered(kind: string, index: number, title: string) {
  return `${kind} ${index}${title.trim() ? `: ${title.trim()}` : ""}`;
}
function markdown(
  rows: NonNullable<ExportRows>,
  options: z.infer<typeof manuscriptExportOptionsSchema>,
) {
  const output: string[] = [];
  if (options.titlePage)
    output.push(
      `# ${rows.project.title}`,
      rows.project.settings.author ? `*${rows.project.settings.author}*` : "",
      "---",
    );
  let actIndex = 0,
    chapterIndex = 0,
    sceneIndex = 0;
  for (const act of projection(rows, options.includeEmptyScenes)) {
    actIndex += 1;
    if (options.actHeadings) output.push(`## ${numbered("Act", actIndex, act.title)}`);
    for (const chapter of act.chapters) {
      chapterIndex += 1;
      if (options.chapterHeadings)
        output.push(`### ${numbered("Chapter", chapterIndex, chapter.title)}`);
      for (const scene of chapter.scenes) {
        sceneIndex += 1;
        if (options.sceneHeadings)
          output.push(`#### ${numbered("Scene", sceneIndex, scene.title)}`);
        for (const block of scene.blocks)
          output.push(
            block
              .map((run) =>
                run.bold && run.italic
                  ? `***${run.text}***`
                  : run.bold
                    ? `**${run.text}**`
                    : run.italic
                      ? `*${run.text}*`
                      : run.text,
              )
              .join(""),
          );
      }
    }
  }
  return `${output.join("\n\n").trim()}\n`;
}

async function docx(
  rows: NonNullable<ExportRows>,
  options: z.infer<typeof manuscriptExportOptionsSchema>,
) {
  const children: Paragraph[] = [];
  if (options.titlePage) {
    children.push(
      new Paragraph({
        text: rows.project.title,
        heading: HeadingLevel.TITLE,
        alignment: AlignmentType.CENTER,
      }),
      new Paragraph({ text: rows.project.settings.author, alignment: AlignmentType.CENTER }),
      new Paragraph({ children: [new PageBreak()] }),
    );
  }
  let actIndex = 0,
    chapterIndex = 0,
    sceneIndex = 0;
  for (const act of projection(rows, options.includeEmptyScenes)) {
    actIndex += 1;
    if (options.actHeadings)
      children.push(
        new Paragraph({
          text: numbered("Act", actIndex, act.title),
          heading: HeadingLevel.HEADING_1,
        }),
      );
    for (const chapter of act.chapters) {
      chapterIndex += 1;
      if (options.chapterHeadings)
        children.push(
          new Paragraph({
            text: numbered("Chapter", chapterIndex, chapter.title),
            heading: HeadingLevel.HEADING_2,
          }),
        );
      for (const scene of chapter.scenes) {
        sceneIndex += 1;
        if (options.sceneHeadings)
          children.push(
            new Paragraph({
              text: numbered("Scene", sceneIndex, scene.title),
              heading: HeadingLevel.HEADING_3,
            }),
          );
        for (const block of scene.blocks)
          children.push(
            new Paragraph({
              children: block.map(
                (run) =>
                  new TextRun({
                    text: run.text,
                    ...(run.bold ? { bold: true } : {}),
                    ...(run.italic ? { italics: true } : {}),
                  }),
              ),
            }),
          );
      }
    }
  }
  return Packer.toBuffer(new Document({ sections: [{ children }] }));
}

function wrap(text: string, width = 92) {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    if (`${line} ${word}`.trim().length > width && line) {
      lines.push(line);
      line = word;
    } else line = `${line} ${word}`.trim();
  }
  lines.push(line);
  return lines;
}
async function pdf(
  rows: NonNullable<ExportRows>,
  options: z.infer<typeof manuscriptExportOptionsSchema>,
) {
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.TimesRoman);
  const bold = await document.embedFont(StandardFonts.TimesRomanBold);
  let page = document.addPage([612, 792]);
  let y = 744;
  const write = (text: string, size = 12, heading = false) => {
    for (const line of wrap(text, size >= 18 ? 60 : 92)) {
      if (y < 50) {
        page = document.addPage([612, 792]);
        y = 744;
      }
      page.drawText(line, {
        x: 54,
        y,
        size,
        font: heading ? bold : regular,
        color: rgb(0.08, 0.08, 0.08),
      });
      y -= size * 1.45;
    }
    y -= size * 0.35;
  };
  if (options.titlePage) {
    y = 540;
    write(rows.project.title, 24, true);
    if (rows.project.settings.author) write(rows.project.settings.author, 14);
    page = document.addPage([612, 792]);
    y = 744;
  }
  let actIndex = 0,
    chapterIndex = 0,
    sceneIndex = 0;
  for (const act of projection(rows, options.includeEmptyScenes)) {
    actIndex += 1;
    if (options.actHeadings) write(numbered("Act", actIndex, act.title), 20, true);
    for (const chapter of act.chapters) {
      chapterIndex += 1;
      if (options.chapterHeadings)
        write(numbered("Chapter", chapterIndex, chapter.title), 17, true);
      for (const scene of chapter.scenes) {
        sceneIndex += 1;
        if (options.sceneHeadings) write(numbered("Scene", sceneIndex, scene.title), 14, true);
        for (const block of scene.blocks) write(block.map((run) => run.text).join(""));
      }
    }
  }
  return Buffer.from(await document.save());
}

export async function registerExportRoutes(
  app: FastifyInstance,
  context: AppContext,
): Promise<void> {
  app.get("/api/projects/:id/export", async (request, reply) => {
    const { id } = parseWith(paramsSchema, request.params);
    if (!(await ownsProject(context, request.userId, id)))
      return notFound(reply, "Project not found.");
    const rows = await loadProject(context, id);
    if (!rows) return notFound(reply, "Project not found.");
    reply
      .header(
        "Content-Disposition",
        `attachment; filename="${safeFilename(rows.project.title)}.json"`,
      )
      .type("application/json");
    return jsonPayload(rows);
  });
  app.post("/api/projects/:id/export", async (request, reply) => {
    const { id } = parseWith(paramsSchema, request.params);
    if (!(await ownsProject(context, request.userId, id)))
      return notFound(reply, "Project not found.");
    const options = parseWith(manuscriptExportOptionsSchema, request.body);
    const rows = await loadProject(context, id);
    if (!rows) return notFound(reply, "Project not found.");
    const base = safeFilename(rows.project.title);
    if (options.format === "json") {
      reply
        .header("Content-Disposition", `attachment; filename="${base}.json"`)
        .type("application/json");
      return jsonPayload(rows);
    }
    if (options.format === "markdown") {
      reply
        .header("Content-Disposition", `attachment; filename="${base}.md"`)
        .type("text/markdown; charset=utf-8");
      return markdown(rows, options);
    }
    if (options.format === "docx") {
      reply
        .header("Content-Disposition", `attachment; filename="${base}.docx"`)
        .type("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      return reply.send(await docx(rows, options));
    }
    reply
      .header("Content-Disposition", `attachment; filename="${base}.pdf"`)
      .type("application/pdf");
    return reply.send(await pdf(rows, options));
  });
}
