// Records a screen capture of the running app walking through the core flows:
// login → view projects → switch org → hit a plan limit → upgrade → invite a
// teammate. Not part of the app; run manually to (re)generate the demo.
//
// Prereqs: app running on localhost:3000 with seed data, plus:
//   npm i -D playwright && npx playwright install chromium
// Usage: node scripts/record-demo.mjs [outDir]
import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs";

const baseUrl = "http://localhost:3000";
const outDir = process.argv[2] ?? "/tmp/saas-demo";
fs.mkdirSync(outDir, { recursive: true });

const VIEWPORT = { width: 1280, height: 800 };
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: VIEWPORT,
  recordVideo: { dir: outDir, size: VIEWPORT },
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();

async function type(selector, text) {
  await page.click(selector);
  await page.fill(selector, "");
  await page.type(selector, text, { delay: 45 });
}

try {
  // 1. Landing page
  await page.goto(baseUrl);
  await pause(2200);

  // 2. Log in as the seeded demo user
  await page.getByRole("link", { name: "Sign in" }).first().click();
  await page.waitForURL("**/login");
  await pause(800);
  await type("#email", "demo@launchpad.dev");
  await type("#password", "password123");
  await pause(500);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/dashboard");
  await pause(2200); // Acme Inc (Pro) — 3 projects

  // 3. Switch to the Free organization
  await page.selectOption("select[name=orgId]", { label: "Globex (Free)" });
  await page.waitForLoadState("networkidle");
  await pause(1800);

  // 4. Add projects until we hit the Free plan limit
  await type("input[name=name]", "Beta Launch");
  await page.getByRole("button", { name: "Add" }).click();
  await pause(1400);
  await type("input[name=name]", "Growth Experiments");
  await page.getByRole("button", { name: "Add" }).click();
  await pause(1800); // now at 3/3 — the add form is replaced by the upgrade prompt

  // 5. Upgrade to Pro (stub checkout applies instantly)
  await page.getByRole("link", { name: "Upgrade" }).click();
  await page.waitForURL("**/billing");
  await pause(2000);
  await page.getByRole("button", { name: /Upgrade to Pro/ }).click();
  await page.waitForURL("**/billing**");
  await pause(2400); // success banner + Pro is now current

  // 6. Back to projects — the limit is lifted
  await page.getByRole("link", { name: "Projects" }).click();
  await page.waitForURL("**/dashboard");
  await pause(1200);
  await type("input[name=name]", "Enterprise Rollout");
  await page.getByRole("button", { name: "Add" }).click();
  await pause(1800);

  // 7. Invite a teammate
  await page.getByRole("link", { name: "Members" }).click();
  await page.waitForURL("**/members");
  await pause(1400);
  await type("input[name=email]", "newhire@globex.com");
  await page.selectOption("select[name=role]", "admin");
  await pause(500);
  await page.getByRole("button", { name: "Send invite" }).click();
  await pause(2600); // invite link appears
} finally {
  await ctx.close(); // finalizes the video file
  await browser.close();
}

const file = fs.readdirSync(outDir).find((f) => f.endsWith(".webm"));
console.log(path.join(outDir, file));
