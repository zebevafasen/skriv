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
  await page.reload();

  await page.getByRole("button", { name: "Create story" }).click();
  await page.getByPlaceholder("The Last Ember").fill(`Playwright Story ${Date.now()}`);
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]+/);
  const projectId = page.url().split("/").at(-1);
  if (!projectId) throw new Error("Project ID was not present in the URL.");
  const ingredientPacksResponse = await page.request.get("/api/ingredient-packs");
  const ingredientPacks = (await ingredientPacksResponse.json()) as Array<{
    id: string;
    values: { tags: string[] };
  }>;
  const tagPack = ingredientPacks.find((pack) => pack.values.tags.length > 0);
  if (!tagPack) throw new Error("Expected a built-in ingredient pack with tag suggestions.");
  const importPackResponse = await page.request.post(
    `/api/projects/${projectId}/ingredient-packs/${tagPack.id}/import`,
  );
  expect(importPackResponse.ok()).toBe(true);

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
    const viewingMode = page.getByRole("button", { name: "Manuscript navigator" });
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
    const ideation = page.locator(".ideation-panel");
    const premiseInstructions = page.getByPlaceholder(
      "Adult gothic tone; let Evelyn complicate the central relationship.",
    );
    await premiseInstructions.fill("Let Evie complicate the central relationship.");
    await expect(ideation.locator(".ideation-instructions-input mark", { hasText: "Evie" })).toBeVisible();
    await ideation.getByRole("button", { name: /Reference/ }).click();
    await page.locator(".ideation-reference-options label", { hasText: "Evelyn" }).click();
    await expect(ideation.locator(".ideation-reference-chips", { hasText: "Evelyn" })).toBeVisible();
    await ideation.getByRole("button", { name: /Reference/ }).click();
    await ideation.getByRole("button", { name: "Entity" }).click();
    await page
      .getByPlaceholder("What should this entity contribute to the story?")
      .fill("Make this entity unsettling.");
    await ideation.getByRole("button", { name: "Premise" }).click();
    await expect(premiseInstructions).toHaveValue("Let Evie complicate the central relationship.");
    await expect(ideation.locator(".ideation-reference-chips", { hasText: "Evelyn" })).toBeVisible();

    await ideation.getByRole("button", { name: "Compendium", exact: true }).click();
    const ideationCompendium = page.locator(".ideation-compendium-dialog");
    await expect(ideationCompendium).toBeVisible();
    await ideationCompendium.locator(".entry-row", { hasText: "Evelyn" }).click();
    await expect(page.getByRole("textbox", { name: "Entry name" })).toHaveValue("Evelyn");
    await page.getByRole("button", { name: "Close entry" }).click();
    await page.getByRole("button", { name: "Close Compendium" }).click();
    await expect(ideationCompendium).toBeHidden();
    await expect(premiseInstructions).toHaveValue("Let Evie complicate the central relationship.");

    const tagGroup = ideation.locator(".unified-tags").filter({
      has: page.locator(".field-label", { hasText: "Tags" }),
    });
    const tagInput = tagGroup.locator("input");
    await tagInput.click();
    const tagSuggestions = tagGroup.locator(".tag-suggestions");
    await expect(tagSuggestions).toBeVisible();
    const suggestionScrollTop = await tagSuggestions.evaluate((menu) => {
      menu.scrollTop = Math.min(120, menu.scrollHeight - menu.clientHeight);
      return menu.scrollTop;
    });
    expect(suggestionScrollTop).toBeGreaterThan(0);
    const suggestedTagName = await tagSuggestions.evaluate((menu) => {
      const menuRect = menu.getBoundingClientRect();
      const visibleButton = [...menu.querySelectorAll("button")].find((button) => {
        const buttonRect = button.getBoundingClientRect();
        return buttonRect.top >= menuRect.top && buttonRect.bottom <= menuRect.bottom;
      });
      return visibleButton?.textContent?.trim();
    });
    if (!suggestedTagName) throw new Error("Expected a visible suggested tag");
    await tagSuggestions.getByRole("button", { name: suggestedTagName, exact: true }).click();
    await expect(tagSuggestions).toBeVisible();
    await expect(tagInput).toBeFocused();
    await expect
      .poll(() => tagSuggestions.evaluate((menu) => menu.scrollTop))
      .toBe(suggestionScrollTop);
    await expect(page.locator(".selected-tag", { hasText: suggestedTagName })).toBeVisible();

    const customTag = "E2E Custom Tag";
    const persistedPremise = "A premise selected for persistence testing.";
    const premiseSaved = page.waitForResponse(
      (response) =>
        response.request().method() === "PATCH" && response.url().includes("/ideation"),
    );
    await page.getByRole("textbox", { name: "Active premise" }).fill(persistedPremise);
    await premiseSaved;
    await tagInput.fill(customTag);
    await tagInput.press("Enter");
    await expect(page.locator(".selected-tag", { hasText: customTag })).toBeVisible();
    const ingredientsSaved = page.waitForResponse(
      (response) =>
        response.request().method() === "PATCH" && response.url().includes("/ideation"),
    );
    await page.getByRole("button", { name: "Save ingredients" }).click();
    await ingredientsSaved;

    await ideation.getByRole("button", { name: "Compendium", exact: true }).click();
    await expect(ideationCompendium.locator(".entry-row", { hasText: "Tags" })).toContainText(
      customTag,
    );
    await page.getByRole("button", { name: "Close Compendium" }).click();
    await page.reload();
    await expect(page.locator(".selected-tag", { hasText: customTag })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Active premise" })).toHaveValue(
      persistedPremise,
    );

    await page.evaluate(() => localStorage.setItem("asterism-latest-model", "asterism/fake-prose"));
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

    await page.getByRole("button", { name: "Project menu" }).click();
    await page.getByRole("menuitem", { name: "Rename project" }).click();
    const renameDialog = page.getByRole("dialog", { name: "Rename Project" });
    await renameDialog
      .getByRole("textbox", { name: "Project title" })
      .fill("Renamed Playwright Story");
    await renameDialog.getByRole("button", { name: "Save" }).click();
    await expect(page.locator(".workspace-project-title")).toHaveText("Renamed Playwright Story");
  } finally {
    await page.request.delete(`/api/projects/${projectId}`, { timeout: 5_000 }).catch(() => null);
  }
});
