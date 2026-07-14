describe("restart persistence", () => {
  it("loads the project created by the previous desktop session", async () => {
    const libraryHeading = await $("h1=Your stories");
    await libraryHeading.waitForDisplayed({
      timeout: 30_000,
      timeoutMsg: `Asterism did not reach the library. Body: ${await $("body").getText()}`,
    });
    const projectCard = await $("h2=E2E Northern Lights");
    await projectCard.waitForDisplayed({ timeout: 15_000 });
    await projectCard.click();
    await browser.waitUntil(async () => (await browser.getUrl()).includes("/projects/"));
    await expect($(".ProseMirror")).toHaveText(expect.stringContaining("harbor lights"));
  });
});
