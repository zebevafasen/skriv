import { expect, type Page, test } from "@playwright/test";

test.setTimeout(60_000);

async function candidateFollowsSceneBeat(page: Page): Promise<boolean> {
  return page.locator(".scene-beat-card").evaluate((beat) => {
    const candidate = beat
      .closest(".continuous-scene-content")
      ?.querySelector('[data-testid="temporary-generation"]');
    return Boolean(
      candidate &&
        (beat.compareDocumentPosition(candidate) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
    );
  });
}

test("regenerates prose at the original position and accepts the replacement", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Your stories" })).toBeVisible();
  await page.request.patch("/api/settings/ai", {
    data: {
      baseModel: "skriv/fake-prose",
      contextModel: "skriv/fake-context",
      smartContextEnabled: true,
      recursionDepth: 2,
    },
  });

  await page.getByRole("button", { name: "Create story" }).click();
  await page.getByPlaceholder("The Last Ember").fill(`Regeneration Test ${Date.now()}`);
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]+/);
  const projectId = page.url().split("/").at(-1);
  if (!projectId) throw new Error("Project ID was not present in the URL.");

  try {
    const sceneContent = page.locator(".continuous-scene-content");
    await expect(sceneContent).toHaveCount(1);
    await sceneContent.click();
    await page.keyboard.press("/");
    await page.getByPlaceholder("Describe what should happen next...").fill("Open on a discovery.");
    await page.getByRole("button", { name: "Generate" }).click();
    await expect(page.getByText("Candidate ready")).toBeVisible({ timeout: 10_000 });

    const temporaryGeneration = page.getByTestId("temporary-generation");
    await expect(temporaryGeneration).toHaveCount(1);
    await expect.poll(() => candidateFollowsSceneBeat(page)).toBe(true);

    await page.getByRole("button", { name: "Regenerate" }).click();
    await expect(page.getByText("Skriv is rewriting…")).toBeVisible({ timeout: 10_000 });
    await expect(temporaryGeneration).toHaveCount(1);
    await expect(page.getByText("Candidate ready")).toBeVisible({ timeout: 10_000 });
    await expect.poll(() => candidateFollowsSceneBeat(page)).toBe(true);

    await page.getByRole("button", { name: "Accept" }).click();
    await expect(temporaryGeneration).toHaveCount(0);
    await expect(page.getByText("Scene changed after generation began.")).toHaveCount(0);
    await expect(sceneContent).toContainText("The room seemed to gather itself");
    await expect(page.locator(".manuscript-scope-stats")).toContainText(/[1-9]\d* words/);

    await page.reload();
    await expect(page.locator(".continuous-scene-content")).toContainText(
      "The room seemed to gather itself",
    );
  } finally {
    await page.request.delete(`/api/projects/${projectId}`, { timeout: 5_000 }).catch(() => null);
  }
});
