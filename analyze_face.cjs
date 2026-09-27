const fs = require('fs');
const PNG = require('pngjs').PNG;

fs.createReadStream('src/assets/characters/director/director-character.png')
  .pipe(new PNG())
  .on('parsed', function() {
    let width = this.width;
    let startX = 750;
    let endX = 1000;
    let startY = 200;
    let endY = 320;
    
    // We will print every 2 pixels
    console.log('Region X:', startX, 'to', endX, 'Y:', startY, 'to', endY);
    console.log('Legend: # = Black, . = White, - = Skin, | = Other');
    
    for (let y = startY; y < endY; y += 2) {
      let line = '';
      for (let x = startX; x < endX; x += 2) {
        let idx = (width * y + x) << 2;
        let r = this.data[idx];
        let g = this.data[idx+1];
        let b = this.data[idx+2];
        let a = this.data[idx+3];
        
        if (a < 128) {
          line += ' '; // Transparent
        } else if (r < 80 && g < 80 && b < 80) {
          line += '#'; // Black/Dark
        } else if (r > 200 && g > 200 && b > 200) {
          line += '.'; // White
        } else if (r > 200 && g > 150 && b > 100) {
          line += '-'; // Skin
        } else {
          line += '|'; // Other (Hair/Shirt etc)
        }
      }
      console.log(y.toString().padStart(4) + ' ' + line);
    }
  });
