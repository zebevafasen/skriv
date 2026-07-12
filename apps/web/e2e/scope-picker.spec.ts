import { expect, test } from "@playwright/test";

test("switches manuscript scope through the hierarchical viewing menu", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create story" }).click();
  await page.getByPlaceholder("The Last Ember").fill(`Scope Picker Test ${Date.now()}`);
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]+/);
  const projectId = page.url().split("/").at(-1);
  if (!projectId) throw new Error("Project ID was not present in the URL.");

  try {
    const viewingMode = page.getByRole("button", { name: "Viewing mode" });
    await expect(viewingMode).toContainText("Everything");
    await expect(page.locator(".manuscript-scope-stats")).toContainText("0 words");

    await viewingMode.click();
    const menu = page.getByRole("listbox", { name: "Manuscript viewing scope" });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("option", { name: /Everything/ })).toBeVisible();
    await expect(menu.getByRole("option", { name: /Current Scene/ })).toBeVisible();
    await expect(menu.getByRole("group", { name: /Act 1/ })).toBeVisible();
    await expect(menu.getByRole("option", { name: /Full Act/ })).toBeVisible();
    await expect(menu.getByRole("option", { name: /Chapter 1/ })).toBeVisible();

    await menu.getByRole("option", { name: /Current Scene/ }).click();
    await expect(page).toHaveURL(/scope=scene%3A/);
    await expect(viewingMode).toContainText("Scene 1");
    await expect(page.locator(".manuscript-scope-header h2")).toHaveText("Scene 1");

    await viewingMode.click();
    await page.getByRole("option", { name: /Full Act/ }).click();
    await expect(page).toHaveURL(/scope=act%3A/);
    await expect(viewingMode).toContainText("Act 1");
    await expect(page.locator(".manuscript-scope-header h2")).toHaveText("Act 1");

    await viewingMode.click();
    await page.getByRole("option", { name: /Chapter 1/ }).click();
    await expect(page).toHaveURL(/scope=chapter%3A/);
    await expect(viewingMode).toContainText("Chapter 1");
    await expect(page.locator(".manuscript-scope-header h2")).toHaveText("Chapter 1");

    await viewingMode.click();
    await page.getByRole("option", { name: /Everything/ }).click();
    await expect(page).not.toHaveURL(/scope=/);
    await expect(viewingMode).toContainText("Everything");
    await expect(page.locator(".manuscript-scope-header h2")).toContainText("Scope Picker Test");
  } finally {
    await page.request.delete(`/api/projects/${projectId}`, { timeout: 5_000 }).catch(() => null);
  }
});
