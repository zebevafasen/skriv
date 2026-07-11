import { expect, test } from "@playwright/test";

test("creates a manuscript and accepts streamed prose", async ({ page }) => {
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
  expect(projectId).toBeTruthy();
  await expect(page.getByRole("heading", { name: "Opening Scene" })).toBeVisible();

  const editor = page.locator(".manuscript-prose");
  await editor.click();
  await page.keyboard.press("/");
  await expect(page.getByRole("dialog", { name: "AI writing command" })).toBeVisible();
  await page.getByRole("button", { name: "Generate" }).click();

  await expect(page.getByText("Candidate ready")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("temporary-generation")).not.toBeEmpty();
  await page.getByRole("button", { name: "Accept" }).click();
  await expect(page.getByText("Version 2")).toBeVisible();
  await expect(page.getByTestId("temporary-generation")).toHaveCount(0);
  await expect(editor).not.toBeEmpty();

  await editor.click();
  await page.keyboard.press("/");
  await expect(page.getByRole("button", { name: "No limit Write until complete" })).toBeVisible();
  await page.getByRole("button", { name: "3 paragraphs" }).click();
  await page.getByRole("button", { name: "Generate" }).click();
  await expect(page.getByText("Candidate ready")).toBeVisible({ timeout: 10_000 });
  await expect(page.locator(".temporary-generation-paragraph")).toHaveCount(3);
  await page.getByRole("button", { name: "Reject" }).click();
  await expect(page.getByTestId("temporary-generation")).toHaveCount(0);

  await page.getByRole("button", { name: "Full story" }).click();
  await expect(page.getByText("Continuous manuscript")).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit Scene" })).toBeVisible();

  await page.getByRole("button", { name: "Compendium" }).click();
  await expect(page.locator(".compendium-sidebar")).toBeVisible();
  await expect(page.getByText("Continuous manuscript")).toBeVisible();
  await page.getByRole("button", { name: "New entry" }).click();
  await expect(page.getByRole("menu", { name: "Choose entry type" })).toBeVisible();
  await page.getByRole("menuitem", { name: "Character" }).click();
  const titleInput = page.getByRole("textbox", { name: "Entry name" });
  await expect(titleInput).toHaveValue("Untitled Character");
  await expect(page.getByTestId("compendium-drawer-layer")).toBeVisible();
  await expect(page.getByRole("tab", { name: "Details" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Tracking" })).toBeVisible();
  await expect(page.getByText("Continuous manuscript")).toBeAttached();
  await titleInput.fill("Disposable Test Entry");
  await page
    .getByTestId("compendium-drawer-layer")
    .getByRole("button", { name: "Character" })
    .click();
  await page.getByRole("menuitem", { name: "Location" }).click();
  await page.getByRole("button", { name: "Save" }).click();
  const disposableRow = page.getByRole("button", { name: /Disposable Test Entry/ });
  await expect(disposableRow).toBeVisible();
  await expect(disposableRow.locator(".lucide-map-pin")).toBeVisible();
  const locationToggle = page.locator(".entry-group-toggle", { hasText: "Location" });
  await locationToggle.click();
  await expect(disposableRow).toBeHidden();
  await expect(locationToggle).toHaveAttribute("aria-expanded", "false");
  await locationToggle.click();
  await expect(disposableRow).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete entry" }).click();
  await expect(page.getByRole("button", { name: /Disposable Test Entry/ })).toHaveCount(0);

  await page.getByRole("button", { name: "New entry" }).click();
  await page.getByRole("menuitem", { name: "Character" }).click();
  await expect(titleInput).toHaveValue("Untitled Character");
  await titleInput.fill("Evelyn");
  await page.getByRole("textbox", { name: "Add tags or labels" }).fill("POV");
  await page.getByRole("button", { name: "POV", exact: true }).click();
  await page.getByPlaceholder("Add aliases, …").fill("Evie, Evelyn Hart");
  await page.getByPlaceholder("Write a description…").fill("A determined apprentice cartographer.");
  await page.locator('input[type="file"]').setInputFiles({
    name: "evelyn.gif",
    mimeType: "image/gif",
    buffer: Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64"),
  });
  await page.getByRole("tab", { name: "Tracking" }).click();
  await page.getByRole("radio", { name: /Smart inclusion/ }).check();
  await page.getByRole("button", { name: "Save" }).click();
  const evelynRow = page.getByRole("button", { name: /Evelyn.*POV/ });
  await expect(evelynRow).toBeVisible();
  await expect(evelynRow.locator(".entry-row-avatar img")).toBeVisible();
  await expect(page.getByRole("img", { name: "Entry portrait" })).toBeVisible();
  await page.locator(".sidebar-tabs").getByRole("button", { name: "Manuscript" }).click();
  await page.getByRole("button", { name: "Opening Scene" }).click();
  await editor.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(" Evelyn");
  const editorMention = editor.locator(".compendium-mention", { hasText: "Evelyn" });
  await expect(editorMention).toBeVisible();
  await expect(page.getByText("Version 3")).toBeVisible();
  await editorMention.click();
  await expect(page.getByRole("heading", { name: "Quick reference" })).toBeVisible();
  await page.getByRole("button", { name: "Close preview" }).click();
  await editorMention.click({ modifiers: ["Control"] });
  await expect(titleInput).toHaveValue("Evelyn");
  await expect(editor).toBeAttached();
  await expect(page.getByTestId("compendium-drawer-layer")).toBeVisible();

  await page.locator(".sidebar-tabs").getByRole("button", { name: "Manuscript" }).click();
  await page.getByRole("button", { name: "Full story" }).click();
  const continuousMention = page.locator(".continuous-compendium-mention", {
    hasText: "Evelyn",
  });
  await expect(continuousMention).toBeVisible();
  await continuousMention.click();
  await expect(page.getByRole("heading", { name: "Quick reference" })).toBeVisible();
  await page.getByRole("button", { name: "Close preview" }).click();

  await page.getByRole("button", { name: "Ideation" }).click();
  const customTag = `Clockwork ${Date.now()}`;
  const tagInput = page.getByPlaceholder("Type or choose tags…");
  await tagInput.fill(customTag);
  await tagInput.press("Enter");
  await expect(page.locator(".selected-tag", { hasText: customTag })).toBeVisible();
  await page.getByRole("button", { name: "Save ingredients" }).click();

  await page.request.delete(`/api/projects/${projectId}`);
});
