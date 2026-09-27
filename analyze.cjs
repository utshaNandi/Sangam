const fs = require('fs');
const PNG = require('pngjs').PNG;

fs.createReadStream('src/assets/characters/director/director-character.png')
  .pipe(new PNG())
  .on('parsed', function() {
    let chars = [' ', '.', ':', '-', '=', '+', '*', '#', '%', '@'];
    console.log('X ranges from 800 to 1200, step 4');
    for (let y = 150; y < 450; y += 4) {
      let line = '';
      for (let x = 700; x < 1200; x += 4) {
        let idx = (this.width * y + x) << 2;
        let r = this.data[idx];
        let g = this.data[idx+1];
        let b = this.data[idx+2];
        let a = this.data[idx+3];
        if (a < 128) {
           line += ' ';
        } else {
           let brightness = (r + g + b) / (3 * 255);
           let charIdx = Math.floor((1 - brightness) * (chars.length - 1));
           line += chars[charIdx];
        }
      }
      console.log(y.toString().padStart(4) + ' ' + line);
    }
  });
