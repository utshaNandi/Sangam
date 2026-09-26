const jimp = require('jimp');
const { Jimp, intToRGBA, rgbaToInt } = jimp;

async function analyze() {
  const image = await Jimp.read('src/components/teacher1.png');
  const width = image.bitmap.width;
  const height = image.bitmap.height;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const hex = image.getPixelColor(x, y);
      const { r, g, b, a } = intToRGBA(hex);
      if (a === 0) continue;
      
      // Teacher's shirt is a muted teal (#538C8C roughly -> R:83, G:140, B:140).
      // We want to shift it to yellow/gold (#DFB980 -> R:223, G:185, B:128)
      // Skin color is pale peach. Hair is dark.
      
      // Condition for teal shirt: G > R, B > R, G > 60
      if (g > r && b > r && g > 60) {
        // Shift it to yellow/gold (#DFB980 -> R:223, G:185, B:128)
        // Original: R=83, G=140, B=140
        // Target:   R=223, G=185, B=128
        // Let's multiply G to become R, keep G roughly the same, lower B
        
        let newR = Math.min(255, g * 1.6);
        let newG = Math.min(255, g * 1.3);
        let newB = Math.min(255, b * 0.9);
        
        const newColor = rgbaToInt(newR, newG, newB, a);
        image.setPixelColor(newColor, x, y);
      }
    }
  }

  return new Promise((resolve, reject) => {
    image.write('src/assets/characters/student/student-character.png', (err) => {
      if (err) reject(err);
      else {
        console.log('Done!');
        resolve();
      }
    });
  });
}

analyze().catch(console.error);
