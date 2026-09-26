const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    defaultViewport: { width: 1440, height: 900 }
  });
  const page = await browser.newPage();
  
  // Disable cursor moving eye animation by moving cursor off-screen
  await page.mouse.move(0, 0);

  // Wait for the app to load
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle0' });

  // Optional: wait a moment for animations
  await new Promise(r => setTimeout(r, 1000));

  // The character is in DirectorDashboard, make sure it's loaded
  await page.screenshot({ path: 'screenshot.png', fullPage: true });

  await browser.close();
})();
