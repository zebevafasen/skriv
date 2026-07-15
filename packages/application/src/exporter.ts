import type { ManuscriptExportOptions, Project, TiptapNode } from "@skriv/contracts";
import { AlignmentType, Document, HeadingLevel, Packer, PageBreak, Paragraph, TextRun } from "docx";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

export type ExportScene = { title: string; document: TiptapNode };
export type ExportChapter = { title: string; scenes: ExportScene[] };
export type ExportAct = { title: string; chapters: ExportChapter[] };
export type ManuscriptExportSource = { project: Project; manuscript: ExportAct[] };
type Run = { text: string; bold?: boolean; italic?: boolean };

export function safeExportFilename(title: string): string {
  return (
    title
      .normalize("NFKD")
      .replace(/[^a-z0-9_-]+/gi, "-")
      .replace(/^-|-$/g, "")
      .toLocaleLowerCase() || "skriv-story"
  );
}

function inlineRuns(node: TiptapNode): Run[] {
  if (node.text !== undefined) {
    const bold = node.marks?.some((mark) => mark.type === "bold") ?? false;
    const italic = node.marks?.some((mark) => mark.type === "italic") ?? false;
    return [{ text: node.text, ...(bold ? { bold } : {}), ...(italic ? { italic } : {}) }];
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
      blocks.push([{ text: "• " }, ...inlineRuns(node)]);
      return;
    }
    for (const child of node.content ?? []) visit(child);
  };
  visit(document);
  return blocks;
}

function projection(source: ManuscriptExportSource, includeEmpty: boolean) {
  return source.manuscript
    .map((act) => ({
      title: act.title,
      chapters: act.chapters
        .map((chapter) => ({
          title: chapter.title,
          scenes: chapter.scenes
            .map((scene) => ({ title: scene.title, blocks: sceneBlocks(scene.document) }))
            .filter(
              (scene) =>
                includeEmpty || scene.blocks.some((block) => block.some((run) => run.text.trim())),
            ),
        }))
        .filter((chapter) => includeEmpty || chapter.scenes.length > 0),
    }))
    .filter((act) => includeEmpty || act.chapters.length > 0);
}

const numbered = (kind: string, index: number, title: string) =>
  `${kind} ${index}${title.trim() ? `: ${title.trim()}` : ""}`;

function markdown(source: ManuscriptExportSource, options: ManuscriptExportOptions): Uint8Array {
  const output: string[] = [];
  if (options.titlePage)
    output.push(
      `# ${source.project.title}`,
      source.project.settings.author ? `*${source.project.settings.author}*` : "",
      "---",
    );
  let actIndex = 0;
  let chapterIndex = 0;
  let sceneIndex = 0;
  for (const act of projection(source, options.includeEmptyScenes)) {
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
        for (const block of scene.blocks) {
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
  }
  return new TextEncoder().encode(`${output.join("\n\n").trim()}\n`);
}

async function word(source: ManuscriptExportSource, options: ManuscriptExportOptions) {
  const children: Paragraph[] = [];
  if (options.titlePage) {
    children.push(
      new Paragraph({
        text: source.project.title,
        heading: HeadingLevel.TITLE,
        alignment: AlignmentType.CENTER,
      }),
      new Paragraph({ text: source.project.settings.author, alignment: AlignmentType.CENTER }),
      new Paragraph({ children: [new PageBreak()] }),
    );
  }
  let actIndex = 0;
  let chapterIndex = 0;
  let sceneIndex = 0;
  for (const act of projection(source, options.includeEmptyScenes)) {
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
  const blob = await Packer.toBlob(new Document({ sections: [{ children }] }));
  return new Uint8Array(await blob.arrayBuffer());
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

async function pdf(source: ManuscriptExportSource, options: ManuscriptExportOptions) {
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
    write(source.project.title, 24, true);
    if (source.project.settings.author) write(source.project.settings.author, 14);
    page = document.addPage([612, 792]);
    y = 744;
  }
  let actIndex = 0;
  let chapterIndex = 0;
  let sceneIndex = 0;
  for (const act of projection(source, options.includeEmptyScenes)) {
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
  return document.save();
}

export async function renderManuscriptExport(
  source: ManuscriptExportSource,
  options: ManuscriptExportOptions,
): Promise<{ bytes: Uint8Array; extension: "md" | "docx" | "pdf"; mime: string }> {
  if (options.format === "markdown")
    return { bytes: markdown(source, options), extension: "md", mime: "text/markdown" };
  if (options.format === "docx")
    return {
      bytes: await word(source, options),
      extension: "docx",
      mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    };
  if (options.format === "pdf")
    return { bytes: await pdf(source, options), extension: "pdf", mime: "application/pdf" };
  throw new Error("Portable project archives are handled by the archive service.");
}
