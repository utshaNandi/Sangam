const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    defaultViewport: { width: 1440, height: 900 }
  });
  const page = await browser.newPage();
  
  await page.mouse.move(0, 0);

  await page.goto('http://localhost:5173', { waitUntil: 'networkidle0' });

  // Click on the Director button. Let's find an element containing "DIRECTOR"
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const dirBtn = btns.find(b => b.textContent.includes('DIRECTOR'));
    if (dirBtn) dirBtn.click();
  });

  // Wait a bit for navigation/render
  await new Promise(r => setTimeout(r, 2000));

  await page.screenshot({ path: 'screenshot_director.png', fullPage: true });

  await browser.close();
})();
