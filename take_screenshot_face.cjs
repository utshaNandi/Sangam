const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    defaultViewport: { width: 1440, height: 900 }
  });
  const page = await browser.newPage();
  
  await page.mouse.move(0, 0);
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1000));

  // The character is placed at the right side of the hero box.
  // We can just crop the right part of the screen or the specific container.
  
  const faceClip = {
    x: 1000,
    y: 150,
    width: 300,
    height: 300
  };

  await page.screenshot({ path: 'face_crop.png', clip: faceClip });

  await browser.close();
})();
