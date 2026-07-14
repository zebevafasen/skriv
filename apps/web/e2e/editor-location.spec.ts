import { expect, type Page, test } from "@playwright/test";

async function writingScrollTop(page: Page) {
  return page.locator(".continuous-editor-prose").evaluate((prose) => {
    let element = prose.parentElement;
    while (element) {
      const overflowY = window.getComputedStyle(element).overflowY;
      if (/auto|scroll/u.test(overflowY) && element.scrollHeight > element.clientHeight)
        return element.scrollTop;
      element = element.parentElement;
    }
    return 0;
  });
}

test("restores the writing position after visiting Outline or Notes", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create story" }).click();
  await page.getByPlaceholder("The Last Ember").fill(`Location Memory ${Date.now()}`);
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]+/);
  const projectId = page.url().split("/").at(-1);
  if (!projectId) throw new Error("Project ID was not present in the URL.");

  try {
    const treeResponse = await page.request.get(`/api/projects/${projectId}/tree`);
    const tree = await treeResponse.json();
    const scene = tree.acts[0].chapters[0].scenes[0];
    const paragraphs = Array.from({ length: 45 }, (_, index) => ({
      type: "paragraph",
      content: [{ type: "text", text: `Location marker ${index + 1}. The story continues here.` }],
    }));
    const updateScene = await page.request.patch(`/api/scenes/${scene.id}`, {
      data: {
        expectedVersion: scene.version,
        document: { type: "doc", content: paragraphs },
        plainText: paragraphs.map((paragraph) => paragraph.content[0].text).join("\n\n"),
        revisionReason: "manual",
      },
    });
    expect(updateScene.ok()).toBe(true);
    await page.reload();

    const finalParagraph = page.locator(".continuous-scene-content p").last();
    await finalParagraph.click();
    const beforeOutline = await writingScrollTop(page);
    expect(beforeOutline).toBeGreaterThan(300);

    await page.getByRole("button", { name: "Outline" }).click();
    await expect(page.locator(".outline-grid")).toBeVisible();
    await page.getByRole("button", { name: "Write" }).click();
    await expect(finalParagraph).toBeVisible();
    await expect.poll(() => writingScrollTop(page)).toBeGreaterThan(beforeOutline - 20);

    const beforeNotes = await writingScrollTop(page);
    await page.getByRole("button", { name: "Notes" }).click();
    await expect(page.getByRole("heading", { name: "Notes" })).toBeVisible();
    await page.getByRole("button", { name: "Write" }).click();
    await expect.poll(() => writingScrollTop(page)).toBeGreaterThan(beforeNotes - 20);
  } finally {
    await page.request.delete(`/api/projects/${projectId}`, { timeout: 5_000 }).catch(() => null);
  }
});
