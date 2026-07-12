import { expect, test } from "@playwright/test";

test.setTimeout(120_000);

test("writes, outlines, summarizes, and edits a continuous manuscript", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Your stories" })).toBeVisible();
  await page.request.patch("/api/settings/ai", {
    data: {
      baseModel: "asterism/fake-prose",
      contextModel: "asterism/fake-context",
      smartContextEnabled: true,
      recursionDepth: 2,
    },
  });

  await page.getByRole("button", { name: "Create story" }).click();
  await page.getByPlaceholder("The Last Ember").fill(`Playwright Story ${Date.now()}`);
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]+/);
  const projectId = page.url().split("/").at(-1);
  if (!projectId) throw new Error("Project ID was not present in the URL.");

  try {
    await expect(page.getByRole("button", { name: "Write" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Outline" })).toBeVisible();
    await expect(page.locator(".compendium-sidebar")).toBeVisible();
    const firstSceneContent = page.locator(".continuous-scene-content").first();
    await firstSceneContent.click();
    await page.keyboard.press("/");
    await page.getByRole("button", { name: "Generate" }).click();
    await expect(page.getByText("Candidate ready")).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "Accept" }).click();
    await expect(page.getByTestId("temporary-generation")).toHaveCount(0);
    await expect(firstSceneContent).toContainText("The room seemed to gather itself");

    await page.getByRole("button", { name: "Outline" }).click();
    const firstCard = page.locator(".outline-scene-card").first();
    const summary = firstCard.getByRole("textbox", { name: "Scene 1 summary" });
    await summary.fill("The opening changes the course of the story.");
    await expect(firstCard.locator(".outline-save-state")).toHaveText("saved", {
      timeout: 5_000,
    });
    await firstCard.getByPlaceholder("Add label…").fill("Foreshadowing");
    await firstCard.getByPlaceholder("Add label…").press("Enter");
    await expect(firstCard.getByText(/Foreshadowing/)).toBeVisible();
    await firstCard.getByRole("button", { name: "Summarize" }).click();
    await expect(summary).toContainText("decisive change", { timeout: 5_000 });

    await page.getByRole("button", { name: "New Scene" }).click();
    const viewingMode = page.getByRole("button", { name: "Viewing mode" });
    await expect(viewingMode).toContainText("Scene 2");
    await page.getByRole("button", { name: "Outline" }).click();
    await expect(page.locator(".outline-scene-card")).toHaveCount(2);
    const openingDragHandle = page
      .locator(".outline-scene-card", { hasText: "Scene 1" })
      .locator(".outline-drag-handle");
    await openingDragHandle.focus();
    await page.keyboard.press("Space");
    await page.waitForTimeout(150);
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(150);
    await page.keyboard.press("Space");
    await expect(page.locator(".outline-scene-card").nth(1)).toContainText("Foreshadowing");
    const newSceneCard = page.locator(".outline-scene-card").nth(0);
    await expect(newSceneCard).toContainText("Scene 1");
    await newSceneCard.getByRole("button", { name: "Open Scene" }).click();
    await expect(viewingMode).toContainText("Scene 1");
    await viewingMode.click();
    await page.getByRole("option", { name: /Everything/ }).click();
    await expect(page.locator(".continuous-scene-block")).toHaveCount(2);
    const secondSceneContent = page.locator(".continuous-scene-content").first();
    await secondSceneContent.locator("p").first().click();
    await page.keyboard.type(" Evelyn entered the observatory.");
    await page.waitForTimeout(1_200);

    await page.getByRole("button", { name: "New Entry" }).click();
    await page.getByRole("menuitem", { name: "Character" }).click();
    const titleInput = page.getByRole("textbox", { name: "Entry name" });
    await titleInput.fill("Evelyn");
    await page.getByPlaceholder("Add aliases, …").fill("Evie");
    await page.getByPlaceholder("Write a description…").fill("A determined cartographer.");
    const savedEntry = page.waitForResponse(
      (response) =>
        response.request().method() === "PATCH" && response.url().includes("/api/compendium/"),
    );
    await page.getByRole("button", { name: "Save" }).click();
    await savedEntry;
    await expect(page.getByRole("button", { name: /Evelyn/ })).toBeVisible();
    await page.getByRole("button", { name: "Close entry" }).click();

    const mention = page.locator(".compendium-mention", { hasText: "Evelyn" });
    await expect(mention).toBeVisible();
    await mention.click();
    await expect(page.getByRole("heading", { name: "Quick reference" })).toBeVisible();
    await page.getByRole("button", { name: "Close preview" }).click();

    await page.getByRole("button", { name: "Outline" }).click();
    await expect(page.locator(".outline-compendium-chips", { hasText: "Evelyn" })).toBeVisible();

    await page.getByRole("button", { name: "Ideation" }).click();
    const customTag = "E2E Custom Tag";
    const tagInput = page.getByPlaceholder("Type or choose tags…");
    await tagInput.fill(customTag);
    await tagInput.press("Enter");
    await expect(page.locator(".selected-tag", { hasText: customTag })).toBeVisible();
    await page.getByRole("button", { name: "Save ingredients" }).click();

    await page.getByRole("button", { name: "Chat" }).click();
    await expect(page).toHaveURL(/tab=chat/);
    await page.getByRole("button", { name: "New thread" }).click();
    await expect(page).toHaveURL(/thread=[0-9a-f-]+/);
    const composer = page.getByPlaceholder("Ask anything about this project...");
    await composer.fill("What changed in the observatory?");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.locator(".chat-message.assistant").last()).toContainText(
      "The room seemed to gather itself",
      { timeout: 10_000 },
    );
    await expect(page.getByRole("button", { name: "Regenerate" })).toBeVisible();
    await page.reload();
    await expect(page.locator(".chat-message.assistant").last()).toBeVisible();
    await page.getByRole("button", { name: "Regenerate" }).click();
    await expect(page.locator(".chat-message.assistant").last()).toContainText(
      "The room seemed to gather itself",
      { timeout: 10_000 },
    );
    await page.getByRole("button", { name: "Ideation" }).click();
    await page.goBack();
    await expect(page.getByRole("button", { name: "Regenerate" })).toBeVisible();

    await page.getByTitle("Rename Project").click();
    const renameDialog = page.getByRole("dialog", { name: "Rename Project" });
    await renameDialog
      .getByRole("textbox", { name: "Project title" })
      .fill("Renamed Playwright Story");
    await renameDialog.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("heading", { name: "Renamed Playwright Story" })).toBeVisible();
  } finally {
    await page.request.delete(`/api/projects/${projectId}`, { timeout: 5_000 }).catch(() => null);
  }
});
