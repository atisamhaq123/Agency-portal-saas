import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const base = process.env.TEST_URL || 'http://localhost:3000';
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(base);
  await page.getByRole('heading', { level: 1, name: /Great work deserves/ }).waitFor();
  assert.equal(await page.locator('.lp-feature').count(), 6);
  assert.equal(await page.locator('.lp-use-cases article').count(), 3);
  await mkdir('artifacts', { recursive: true });
  await page.screenshot({ path: 'artifacts/landing-desktop.png', fullPage: true });
  await page.getByText('How do my clients join?', { exact: true }).click();
  assert.equal(await page.locator('details[open]').count(), 1);
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Landing fits ${width}px`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Pricing', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'Open navigation', exact: true }).getAttribute('aria-expanded'), 'false');
  await page.screenshot({ path: 'artifacts/landing-mobile.png', fullPage: true });
  await page.getByRole('link', { name: 'Get started with Pro', exact: true }).click();
  await page.getByRole('group', { name: 'Account type', exact: true }).waitFor();
  await page.getByRole('button', { name: /I'm a Client/ }).click();
  assert.equal(await page.getByLabel('Agency name', { exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Already have an account? Sign in', exact: true }).click();
  assert.equal(await page.getByRole('group', { name: 'Account type', exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Explore demo workspace' }).click();
  await page.getByRole('heading', { name: /Good things ahead/ }).waitFor();
  assert.deepEqual(errors, []);
  console.log('Landing checks passed: content sections, FAQ, mobile navigation, responsive layouts, pricing-to-signup, client signup, login, and demo entry.');
} finally { await browser.close(); }
