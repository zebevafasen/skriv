import { expect, test } from "@playwright/test";

test.setTimeout(120_000);

test("turns a chosen premise into reviewed Compendium entries and a first-Scene candidate", async ({
  page,
}) => {
  await page.goto("/");
  await page.request.patch("/api/settings/ai", {
    data: {
      baseModel: "asterism/fake-prose",
      contextModel: "asterism/fake-context",
      smartContextEnabled: true,
      recursionDepth: 2,
    },
  });
  await page.getByRole("button", { name: "Create story" }).click();
  await page.getByPlaceholder("The Last Ember").fill(`Ideation Flow ${Date.now()}`);
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]+/);
  const projectId = page.url().split("/").at(-1);
  if (!projectId) throw new Error("Project ID was not present in the URL.");

  try {
    await page.getByRole("button", { name: "Ideation" }).click();
    const ideation = page.locator(".ideation-panel");
    await ideation.getByRole("button", { name: "Generate premise alternatives" }).click();
    await expect(ideation.getByRole("button", { name: "Use this premise" }).first()).toBeVisible({
      timeout: 10_000,
    });
    const savedPremise = page.waitForResponse(
      (response) => response.request().method() === "PATCH" && response.url().includes("/ideation"),
    );
    await ideation.getByRole("button", { name: "Use this premise" }).first().click();
    await savedPremise;

    const existingEntry = await page.request.post(`/api/projects/${projectId}/compendium`, {
      data: {
        name: "Mara Vale",
        typeId: "story.character",
        content: { kind: "text", text: "Existing details." },
      },
    });
    expect(existingEntry.ok()).toBe(true);

    await ideation.getByRole("button", { name: "Extract starter entries" }).click();
    await expect(ideation.getByRole("heading", { name: "Review starter entries" })).toBeVisible({
      timeout: 10_000,
    });
    await expect(ideation.locator(".ideation-extraction-card")).toHaveCount(2);
    const existingDraft = ideation
      .locator(".ideation-extraction-card")
      .filter({ has: page.locator('input[value="Mara Vale"]') });
    await expect(existingDraft.getByRole("checkbox", { name: "Include" })).toBeChecked();
    await expect(existingDraft).toContainText("appended to it as a new paragraph");
    await ideation.getByRole("button", { name: "Import selected" }).click();
    await expect(ideation.getByRole("heading", { name: "Set up the first Scene" })).toBeVisible();
    await expect(ideation.getByRole("spinbutton", { name: "Target" })).toHaveValue("1000");

    const compendiumResponse = await page.request.get(`/api/projects/${projectId}/compendium`);
    expect(compendiumResponse.ok()).toBe(true);
    const compendium = (await compendiumResponse.json()) as Array<{
      name: string;
      content: { kind: string; plainText?: string; text?: string };
    }>;
    const maraEntries = compendium.filter((entry) => entry.name === "Mara Vale");
    expect(maraEntries).toHaveLength(1);
    expect(maraEntries[0]?.content.plainText ?? maraEntries[0]?.content.text).toBe(
      "Existing details.\n\nA determined investigator drawn into the premise's central conflict.",
    );

    await ideation.getByRole("button", { name: "Generate first Scene" }).click();
    await expect(page.getByText("Candidate ready")).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "Accept" }).click();
    await expect(page.locator(".continuous-scene-content").first()).toContainText(
      "The room seemed to gather itself",
    );
  } finally {
    await page.request.delete(`/api/projects/${projectId}`, { timeout: 5_000 }).catch(() => null);
  }
});
