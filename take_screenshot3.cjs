const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    defaultViewport: { width: 1440, height: 900 }
  });
  const page = await browser.newPage();
  
  await page.mouse.move(0, 0);

  await page.goto('http://localhost:5173', { waitUntil: 'networkidle0' });

  // Wait a bit
  await new Promise(r => setTimeout(r, 1000));

  // Find the Director book by checking for the text "Director" in its label
  await page.evaluate(() => {
    // find h3 or span or text node with "Director"
    const els = Array.from(document.querySelectorAll('*'));
    const dirEl = els.find(el => el.textContent === 'Director' && el.tagName === 'SPAN');
    if (dirEl) {
      // Find the closest book container and click it
      const book = dirEl.closest('.group');
      if (book) book.click();
    }
  });

  await new Promise(r => setTimeout(r, 1000));
  
  // Submit the form in the expanded book
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button[type="submit"]'));
    // Usually one of them is visible. Just click the first one that has offsetParent
    const visibleBtn = btns.find(b => b.offsetParent !== null);
    if (visibleBtn) visibleBtn.click();
  });

  // Wait for the transition to finish
  await new Promise(r => setTimeout(r, 3000));

  await page.screenshot({ path: 'screenshot_director.png', fullPage: true });

  await browser.close();
})();
