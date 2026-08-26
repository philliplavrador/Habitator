import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * The chat home screen's navigation: the left-hand chat drawer, the "Go to"
 * popup, and the absence of any account/log-out UI.
 */

/**
 * Wait for a framer-motion spring to land on `expectedX`, then measure it.
 * (Polling for "it stopped moving" instead would happily return the panel's
 * off-screen starting position, because a spring's first frames haven't moved
 * yet either.)
 */
async function restingBox(
  locator: Locator,
  expectedX: number
): Promise<{ x: number; y: number; width: number; height: number }> {
  await expect(async () => {
    const box = await locator.boundingBox();
    expect(box).not.toBeNull();
    expect(Math.abs(box!.x - expectedX)).toBeLessThanOrEqual(1);
  }).toPass({ timeout: 5_000 });
  return (await locator.boundingBox())!;
}

async function shellBox(page: Page) {
  const box = await page.getByTestId('app-shell').boundingBox();
  expect(box).not.toBeNull();
  return box!;
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Habitator' })).toBeVisible();
});

test.describe('chat history drawer', () => {
  test('comes in from the left as a full-height side panel', async ({ page }) => {
    const drawer = page.getByTestId('history-drawer');
    const shell = await shellBox(page);

    await page.getByTestId('history-button').click();
    await expect(drawer).toBeVisible();

    // It starts off-screen to the LEFT and slides in — the ChatGPT move. (The
    // spring runs ~300ms, so this samples well inside the animation.)
    const opening = (await drawer.boundingBox())!;
    expect(opening.x).toBeLessThan(shell.x);

    // …and comes to rest against the left edge of the app column.
    const box = await restingBox(drawer, shell.x);
    const viewport = page.viewportSize()!;
    expect(box.y).toBeLessThanOrEqual(1);
    // Full height, partial width. A bottom sheet is the exact opposite of both,
    // so these two lines are what keep this from silently becoming one again.
    expect(box.height).toBeGreaterThan(viewport.height * 0.95);
    expect(box.width).toBeLessThan(viewport.width * 0.9);
  });

  test('holds New chat, which starts an empty conversation', async ({ page }) => {
    await page.getByTestId('history-button').click();
    const drawer = page.getByTestId('history-drawer');
    const newChat = drawer.getByTestId('new-chat');
    await expect(newChat).toBeVisible();

    await newChat.click();
    await expect(drawer).toBeHidden();
    await expect(page.getByText('What do you want?')).toBeVisible();
  });

  test('New chat lives in the drawer, not in the header', async ({ page }) => {
    // The header is down to two controls: history on the left, "Go to" on the
    // right. Anything else there is a regression.
    const header = page.locator('header');
    await expect(header.getByRole('button', { name: 'New chat' })).toHaveCount(0);
    await expect(header.getByRole('button')).toHaveCount(2);
    await expect(header.getByRole('link')).toHaveCount(0);
  });

  test('closes on Escape and on a backdrop tap', async ({ page }) => {
    const drawer = page.getByTestId('history-drawer');

    await page.getByTestId('history-button').click();
    await expect(drawer).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();

    await page.getByTestId('history-button').click();
    await expect(drawer).toBeVisible();
    await restingBox(drawer, (await shellBox(page)).x);
    // Tap the far right of the screen — backdrop, never the panel.
    const viewport = page.viewportSize()!;
    await page.mouse.click(viewport.width - 8, Math.round(viewport.height / 2));
    await expect(drawer).toBeHidden();
  });
});

test.describe('"Go to" menu', () => {
  test('is a popup anchored under its button, with Chat and Tasks', async ({ page }) => {
    await page.getByRole('button', { name: 'Go to' }).click();

    const menu = page.getByTestId('nav-menu');
    await expect(menu).toBeVisible();
    const items = menu.getByRole('menuitem');
    await expect(items).toHaveCount(2);
    await expect(items.nth(0)).toContainText('Chat');
    await expect(items.nth(1)).toContainText('Tasks');

    // Hangs off the header rather than rising from the bottom of the screen.
    const box = (await menu.boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(box.y).toBeLessThan(viewport.height / 3);
    expect(box.width).toBeLessThan(viewport.width * 0.8);
  });

  test('marks Chat as the current place while on the chat screen', async ({ page }) => {
    await page.getByRole('button', { name: 'Go to' }).click();
    const menu = page.getByTestId('nav-menu');
    await expect(menu.getByRole('menuitem', { name: /Chat/ })).toHaveAttribute(
      'aria-current',
      'page'
    );
  });

  test('Tasks goes to the tasks board', async ({ page }) => {
    await page.getByRole('button', { name: 'Go to' }).click();
    await page.getByTestId('nav-menu').getByRole('menuitem', { name: /Tasks/ }).click();
    await expect(page).toHaveURL(/\/tasks(\?|$)/);
    await expect(page.getByRole('heading', { name: /tasks/i })).toBeVisible();
  });

  test('closes on Escape without navigating', async ({ page }) => {
    await page.getByRole('button', { name: 'Go to' }).click();
    const menu = page.getByTestId('nav-menu');
    await expect(menu).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(page).toHaveURL(/\/$/);
  });

  test('replaced the old direct Tasks link in the header', async ({ page }) => {
    await expect(page.locator('header').getByRole('link', { name: 'Tasks' })).toHaveCount(0);
  });
});

test.describe('no account / log-out UI', () => {
  const LOGOUT = /log ?out|sign ?out/i;

  for (const route of ['/', '/tasks', '/today', '/insights', '/fasts']) {
    test(`${route} offers nothing to log out of`, async ({ page }) => {
      await page.goto(route);
      await expect(page.getByText(LOGOUT)).toHaveCount(0);
      await expect(page.getByRole('button', { name: LOGOUT })).toHaveCount(0);
      await expect(page.getByText(/signed in as/i)).toHaveCount(0);
    });
  }

  test('the legacy screens’ data sheet is export-only', async ({ page }) => {
    await page.goto('/today');
    await page.getByRole('button', { name: 'Data' }).click();
    const sheet = page.getByRole('dialog');
    await expect(sheet.getByRole('link', { name: 'Export data' })).toBeVisible();
    await expect(sheet.getByText(LOGOUT)).toHaveCount(0);
  });
});
