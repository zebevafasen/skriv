import { expect, type Page } from "@playwright/test";

export async function createProject(page: Page, titlePrefix: string): Promise<string> {
  await page.getByRole("button", { name: "Create story" }).click();
  await page.getByPlaceholder("The Last Ember").fill(`${titlePrefix} ${Date.now()}`);
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]+/);
  const projectId = page.url().split("?")[0]?.split("/").at(-1);
  if (!projectId) throw new Error("Project ID was not present in the URL.");
  return projectId;
}

export async function deleteProject(page: Page, projectId: string): Promise<void> {
  await page.request.delete(`/api/projects/${projectId}`, { timeout: 5_000 }).catch(() => null);
}
