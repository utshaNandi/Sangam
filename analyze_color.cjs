const Jimp = require('jimp');

async function analyze() {
  const image = await Jimp.read('src/assets/characters/director/director-character.png');
  const width = image.bitmap.width;
  const height = image.bitmap.height;

  // Let's sample a few pixels from the bottom center which should be the shirt
  const x = Math.floor(width / 2);
  const y = height - 50;
  
  const color = Jimp.intToRGBA(image.getPixelColor(x, y));
  console.log(`Sample shirt color at (${x}, ${y}): r=${color.r}, g=${color.g}, b=${color.b}, a=${color.a}`);
}

analyze();
