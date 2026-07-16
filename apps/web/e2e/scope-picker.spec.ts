import { expect, test } from "@playwright/test";
import { createProject, deleteProject } from "./helpers";

test("switches manuscript scope through the hierarchical viewing menu", async ({ page }) => {
  await page.goto("/");
  const projectId = await createProject(page, "Scope Picker Test");

  try {
    const viewingMode = page.getByRole("button", { name: "Manuscript navigator" });
    await expect(viewingMode).toContainText("Everything");
    await expect(page.locator(".manuscript-scope-stats")).toContainText("0 words");

    await viewingMode.click();
    const menu = page.getByRole("listbox", { name: "Manuscript hierarchy" });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("option", { name: /Everything/ })).toBeVisible();
    await expect(menu.getByRole("option", { name: /Scene 1/ })).toBeVisible();
    await expect(menu.getByRole("group", { name: /Act 1/ })).toBeVisible();
    await expect(menu.getByRole("option", { name: /Full Act/ })).toBeVisible();
    await expect(menu.getByRole("option", { name: /Chapter 1/ })).toBeVisible();

    await menu.getByRole("option", { name: /Scene 1/ }).click();
    await expect(page).toHaveURL(/scope=scene%3A/);
    await expect(viewingMode).toContainText("Scene 1");

    await viewingMode.click();
    await page.getByRole("option", { name: /Full Act/ }).click();
    await expect(page).toHaveURL(/scope=act%3A/);
    await expect(viewingMode).toContainText("Act 1");

    await viewingMode.click();
    await page.getByRole("option", { name: /Chapter 1/ }).click();
    await expect(page).toHaveURL(/scope=chapter%3A/);
    await expect(viewingMode).toContainText("Chapter 1");

    await viewingMode.click();
    await page.getByRole("option", { name: /Everything/ }).click();
    await expect(page).not.toHaveURL(/scope=/);
    await expect(viewingMode).toContainText("Everything");
  } finally {
    await deleteProject(page, projectId);
  }
});
