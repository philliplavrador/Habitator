import { expect, test } from '@playwright/test';

/**
 * The "does the UI still look right" guard, run over every screen the owner can
 * reach. It doesn't check pixels (a screenshot diff on a self-modifying app is
 * a full-time job) — it checks the handful of things that actually make a
 * mobile screen look broken:
 *
 *   1. the page renders at all, with no runtime error in the console;
 *   2. nothing pushes the layout sideways (the #1 phone-CSS bug);
 *   3. nothing lands outside the app's column;
 *   4. controls are big enough to hit with a thumb.
 *
 * A screenshot of each screen is attached to the report either way, so the
 * report doubles as a contact sheet you can flick through.
 */

const ROUTES = ['/', '/tasks', '/today', '/insights', '/fasts', '/habits/new'];

/** Dev-server and browser chatter that says nothing about the UI. */
const CONSOLE_NOISE = [
  /Download the React DevTools/i,
  /\[Fast Refresh\]/i,
  /favicon\.ico/i,
  /manifest\.webmanifest/i,
  /sw\.js/i,
  /ServiceWorker/i,
  /Failed to load resource: the server responded with a status of 404/i,
];

/** Apple's floor for a comfortable tap target, minus a hair for borders. */
const MIN_TAP = 28;

for (const route of ROUTES) {
  test(`${route} renders cleanly`, async ({ page }, testInfo) => {
    const problems: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      const text = msg.text();
      if (CONSOLE_NOISE.some((re) => re.test(text))) return;
      problems.push(`console: ${text}`);
    });
    page.on('pageerror', (err) => problems.push(`pageerror: ${err.message}`));

    const response = await page.goto(route);
    expect(response?.status(), `${route} should not error`).toBeLessThan(400);
    await expect(page).not.toHaveURL(/\/login/);
    await page.waitForLoadState('networkidle');

    testInfo.attach(`${route.replace(/\W+/g, '_') || 'home'}-${testInfo.project.name}.png`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });

    // 2. No sideways scroll.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow, `${route} scrolls horizontally`).toBeLessThanOrEqual(1);

    // 3. Nothing escapes the column (a few px of slack for shadows/rings).
    const shell = (await page.getByTestId('app-shell').boundingBox())!;
    const strays = await page.evaluate(
      ({ left, right }) =>
        Array.from(document.querySelectorAll<HTMLElement>('button, a[href], input, textarea'))
          .filter((el) => {
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) return false;
            return r.left < left - 4 || r.right > right + 4;
          })
          .map((el) => `${el.tagName.toLowerCase()}: ${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 40)}`),
      { left: shell.x, right: shell.x + shell.width }
    );
    expect(strays, `${route} has controls outside the app column`).toEqual([]);

    // 4. Thumb-sized controls.
    const tiny = await page.evaluate(
      (min) =>
        Array.from(document.querySelectorAll<HTMLElement>('button, a[href]'))
          .filter((el) => {
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) return false;
            // Inline links inside a paragraph are text, not tap targets.
            if (el.tagName === 'A' && el.closest('p')) return false;
            // The model/effort pill is a label-sized affordance by design.
            if (el.textContent && /·/.test(el.textContent)) return false;
            return r.height < min || r.width < min;
          })
          .map((el) => {
            const r = el.getBoundingClientRect();
            return `${(el.textContent || el.getAttribute('aria-label') || '?').trim().slice(0, 30)} (${Math.round(r.width)}x${Math.round(r.height)})`;
          }),
      MIN_TAP
    );
    expect(tiny, `${route} has controls too small to tap`).toEqual([]);

    // 1. …and nothing blew up on the way.
    expect(problems, `${route} logged errors`).toEqual([]);
  });
}

test('the composer stays reachable above the fold', async ({ page }) => {
  await page.goto('/');
  const viewport = page.viewportSize()!;
  const composer = page.getByPlaceholder('Message Habitator…');
  await expect(composer).toBeVisible();
  const box = (await composer.boundingBox())!;
  // The chat column is h-dvh: the input must sit on screen without scrolling.
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
  await expect(page.getByRole('button', { name: 'Send' })).toBeVisible();
});
