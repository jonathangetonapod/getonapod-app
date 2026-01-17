import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

export async function recordDashboard(slug, baseUrl) {
  console.log(`Starting recording for slug: ${slug}`);

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const outputDir = path.join(process.cwd(), 'recordings');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: {
      dir: outputDir,
      size: { width: 1920, height: 1080 }
    }
  });

  const page = await context.newPage();

  try {
    // Add ?tour=0 to skip the welcome tour
    const url = `${baseUrl}/prospect/${slug}?tour=0`;
    console.log(`Navigating to: ${url}`);

    // [0-8s] Load dashboard and wait for everything to settle
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    console.log('Page loaded, waiting for content to settle...');
    await page.waitForTimeout(6000); // Give site time to fully load

    // Try to dismiss any lingering modals with Escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    // [8-12s] Stay at hero section for a few seconds
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(4000);

    // [6-9s] Scroll down to podcasts
    await page.evaluate(() => window.scrollTo(0, 800));
    await page.waitForTimeout(3000);

    // [9-11s] Click first podcast to open side panel
    // Find the main podcast grid and click the first card
    const podcastGrid = page.locator('.grid.gap-3, .grid.gap-4, .grid.gap-6').filter({ hasText: /.+/ }).first();
    const firstCard = podcastGrid.locator('> *').first();

    console.log('Looking for podcast card...');
    if (await firstCard.count() > 0) {
      console.log('Found podcast card, clicking...');
      await firstCard.scrollIntoViewIfNeeded();
      await page.waitForTimeout(1000);
      await firstCard.click({ force: true });
      await page.waitForTimeout(1000);

      // Wait for panel to open
      try {
        await page.waitForSelector('[role="dialog"]', { state: 'visible', timeout: 5000 });
        console.log('Panel opened');

        // [11-14s] Stay at top of panel for a few seconds
        await page.waitForTimeout(3000);

        // [14-26s] Scroll down the panel slowly
        // Find the scrollable container inside the dialog (usually has overflow-y-auto or similar)
        const scrollContainer = page.locator('[role="dialog"] [data-radix-scroll-area-viewport], [role="dialog"] .overflow-y-auto, [role="dialog"] .overflow-auto').first();

        const scrollCount = await scrollContainer.count();
        console.log(`Found ${scrollCount} scroll containers`);

        if (scrollCount > 0) {
          console.log('Starting panel scroll...');

          // Scroll in small increments for smooth scrolling
          await scrollContainer.evaluate((el) => {
            console.log('Scrolling to 300, element:', el.tagName, 'scrollHeight:', el.scrollHeight);
            el.scrollTop = 300;
          });
          await page.waitForTimeout(2000);

          await scrollContainer.evaluate((el) => el.scrollTop = 600);
          await page.waitForTimeout(2000);

          await scrollContainer.evaluate((el) => el.scrollTop = 900);
          await page.waitForTimeout(2000);

          await scrollContainer.evaluate((el) => el.scrollTop = 1200);
          await page.waitForTimeout(2000);

          await scrollContainer.evaluate((el) => el.scrollTop = 1500);
          await page.waitForTimeout(2000);

          await scrollContainer.evaluate((el) => el.scrollTop = 1800);
          await page.waitForTimeout(2000);

          // Stay at bottom to show approve/reject buttons
          console.log('Showing approve/reject buttons at bottom...');
          await page.waitForTimeout(3000);

          console.log('Panel scroll complete');
        } else {
          console.log('WARNING: No scroll container found, skipping panel scroll');
        }

      } catch (e) {
        console.log('Panel did not open or scroll failed:', e.message);
      }
    }

    // [28-30s] Close panel
    await page.keyboard.press('Escape');
    await page.waitForTimeout(2000);

    // [30-33s] Scroll down to pricing section (target the buy buttons, above testimonials)
    console.log('Scrolling to pricing section...');
    const pricingFound = await page.evaluate(() => {
      // Look for Stripe buy buttons or pricing section
      const pricingSection = document.querySelector('[class*="pricing"]');
      console.log('Pricing section found:', !!pricingSection);

      if (pricingSection) {
        // Use large offset to show pricing cards and buy buttons well above testimonials
        const y = pricingSection.getBoundingClientRect().top + window.scrollY - 700;
        console.log('Scrolling to pricing at position:', y);
        window.scrollTo({ top: y, behavior: 'smooth' });
        return true;
      } else {
        // Fallback: scroll to a position that should show pricing (very conservative)
        const fallbackY = document.body.scrollHeight - 2500;
        console.log('Pricing section not found, using fallback scroll to:', fallbackY);
        window.scrollTo({ top: fallbackY, behavior: 'smooth' });
        return false;
      }
    });
    console.log(`Pricing scroll completed (found: ${pricingFound})`);
    await page.waitForTimeout(3000);

    // [33-38s] Stay at pricing section for a few seconds
    console.log('Showing pricing section...');
    await page.waitForTimeout(5000);

    console.log('Recording completed, finalizing video...');

  } catch (error) {
    console.error('Error during recording:', error);
    throw error;
  } finally {
    await page.close();
    await context.close();
    await browser.close();
  }

  // Get the video file path
  const files = fs.readdirSync(outputDir);
  const videoFile = files.find(f => f.endsWith('.webm'));

  if (!videoFile) {
    throw new Error('Video file not found after recording');
  }

  return path.join(outputDir, videoFile);
}
