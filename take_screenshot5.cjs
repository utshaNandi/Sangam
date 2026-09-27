const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    defaultViewport: { width: 1440, height: 900 }
  });
  const page = await browser.newPage();
  
  // Move mouse away to avoid hover animations affecting eye position
  await page.mouse.move(0, 0);

  await page.goto('http://localhost:5173', { waitUntil: 'networkidle0' });

  // Wait for the app to render
  await new Promise(r => setTimeout(r, 1000));

  await page.screenshot({ path: 'screenshot_director_dashboard.png', fullPage: true });

  await browser.close();
})();
