const fs = require('fs');
const PNG = require('pngjs').PNG;

fs.createReadStream('src/assets/characters/director/director-character.png')
  .pipe(new PNG())
  .on('parsed', function() {
    let width = this.width;
    let height = this.height;
    
    // We are looking for pupils. Pupils are black/dark circles inside the glasses.
    // The glasses frames are also black. But the pupils are solid black blobs.
    // Let's print out the min, max, avg X, Y for dark components.
    // Actually, let's just print a very precise ASCII representation of the face region (x from 50% to 65%, y from 20% to 30%)
    
    let startX = Math.floor(width * 0.50);
    let endX = Math.floor(width * 0.65);
    let startY = Math.floor(height * 0.18);
    let endY = Math.floor(height * 0.28);
    
    console.log('Region X:', startX, 'to', endX, 'Y:', startY, 'to', endY);
    
    for (let y = startY; y < endY; y += 2) {
      let line = '';
      for (let x = startX; x < endX; x += 2) {
        let idx = (width * y + x) << 2;
        let r = this.data[idx];
        let g = this.data[idx+1];
        let b = this.data[idx+2];
        let a = this.data[idx+3];
        
        if (a < 128) {
          line += ' ';
        } else if (r < 50 && g < 50 && b < 50) {
          line += 'X'; // Dark pixel
        } else {
          line += '.';
        }
      }
      console.log(y.toString().padStart(4) + ' ' + line);
    }
  });
