// Records a captioned screen capture of the running app walking through the core
// flows: log in → view an org's projects → switch org → hit a plan limit →
// upgrade (Stripe Checkout, stub here) → invite a teammate with a role.
// Not part of the app; run manually to (re)generate the demo.
//
// Prereqs: app running on localhost:3000 with `npm run seed` data, plus:
//   npm i --no-save playwright && npx playwright install chromium
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

// Burn-in caption overlay. Navigations wipe the injected node, so caption() is
// idempotent — it recreates the element whenever it's missing.
async function caption(text, hold = 0) {
  await page.evaluate((t) => {
    let el = document.getElementById("__cap");
    if (!el) {
      el = document.createElement("div");
      el.id = "__cap";
      el.style.cssText =
        "position:fixed;left:50%;bottom:30px;transform:translateX(-50%);z-index:99999;" +
        "background:rgba(17,17,20,.93);color:#fff;padding:13px 24px;border-radius:999px;" +
        "font:600 17px/1.25 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;" +
        "box-shadow:0 10px 34px rgba(0,0,0,.4);max-width:82vw;text-align:center;letter-spacing:.2px;";
      document.body.appendChild(el);
    }
    el.textContent = t;
  }, text);
  if (hold) await pause(hold);
}

async function type(selector, text) {
  await page.click(selector);
  await page.fill(selector, "");
  await page.type(selector, text, { delay: 55 });
}

try {
  // 1. Landing
  await page.goto(baseUrl);
  await caption("Launchpad — a multi-tenant SaaS starter", 2600);

  // 2. Log in
  await page.getByRole("link", { name: "Sign in" }).first().click();
  await page.waitForURL("**/login");
  await caption("Log in — email + password (scrypt-hashed, httpOnly session)", 1200);
  await type("#email", "demo@launchpad.dev");
  await type("#password", "password123");
  await pause(700);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/dashboard");
  await caption("Every organization is an isolated tenant (Postgres row-level security)", 3000);

  // 3. Switch organization
  await caption("A user can belong to many orgs — switch between them", 1600);
  await page.selectOption("select[name=orgId]", { label: "Globex (Free)" });
  await page.waitForLoadState("networkidle");
  await caption("Now inside Globex, on the Free plan", 2200);

  // 4. Hit the plan limit
  await caption("Plans enforce limits — Free allows 3 projects", 1600);
  await type("input[name=name]", "Beta Launch");
  await page.getByRole("button", { name: "Add" }).click();
  await pause(1300);
  await type("input[name=name]", "Growth Experiments");
  await page.getByRole("button", { name: "Add" }).click();
  await caption("Limit reached — enforced server-side, inside the DB transaction", 3000);

  // 5. Upgrade
  await page.getByRole("link", { name: "Upgrade" }).click();
  await page.waitForURL("**/billing");
  await caption("Billing — Stripe subscriptions (running in keyless stub mode)", 2800);
  await page.getByRole("button", { name: /Upgrade to Pro/ }).click();
  await page.waitForURL("**/billing**");
  await caption("Subscription updated — now on Pro", 3000);

  // 6. Limit lifted
  await page.getByRole("link", { name: "Projects" }).click();
  await page.waitForURL("**/dashboard");
  await caption("Plan badge and limits update instantly — now 3 / 50", 1800);
  await type("input[name=name]", "Enterprise Rollout");
  await page.getByRole("button", { name: "Add" }).click();
  await caption("Limit lifted after the upgrade", 2400);

  // 7. Invite a teammate with a role
  await page.getByRole("link", { name: "Members" }).click();
  await page.waitForURL("**/members");
  await caption("Invite teammates with roles — owner / admin / member (RBAC)", 2000);
  await type("input[name=email]", "newhire@globex.com");
  await page.selectOption("select[name=role]", "admin");
  await pause(600);
  await page.getByRole("button", { name: "Send invite" }).click();
  await caption("Unguessable invite link generated", 3200);
} finally {
  await ctx.close(); // finalizes the video file
  await browser.close();
}

const file = fs.readdirSync(outDir).find((f) => f.endsWith(".webm"));
console.log(path.join(outDir, file));
