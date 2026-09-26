const fs = require('fs');
const PNG = require('pngjs').PNG;

fs.createReadStream('src/assets/characters/director/director-character.png')
  .pipe(new PNG())
  .on('parsed', function() {
    let width = this.width;
    let height = this.height;
    
    // We want to find the bounding boxes of the white lenses.
    // White is r > 220, g > 220, b > 220
    
    let leftSclera = { minX: 9999, maxX: 0, minY: 9999, maxY: 0, count: 0 };
    let rightSclera = { minX: 9999, maxX: 0, minY: 9999, maxY: 0, count: 0 };
    
    for (let y = 200; y < 350; y++) {
      for (let x = 750; x < 1000; x++) {
        let idx = (width * y + x) << 2;
        let r = this.data[idx];
        let g = this.data[idx+1];
        let b = this.data[idx+2];
        let a = this.data[idx+3];
        
        if (a > 200 && r > 200 && g > 200 && b > 200) {
          // It's white
          if (x < 890) { // Left eye
            leftSclera.minX = Math.min(leftSclera.minX, x);
            leftSclera.maxX = Math.max(leftSclera.maxX, x);
            leftSclera.minY = Math.min(leftSclera.minY, y);
            leftSclera.maxY = Math.max(leftSclera.maxY, y);
            leftSclera.count++;
          } else { // Right eye
            rightSclera.minX = Math.min(rightSclera.minX, x);
            rightSclera.maxX = Math.max(rightSclera.maxX, x);
            rightSclera.minY = Math.min(rightSclera.minY, y);
            rightSclera.maxY = Math.max(rightSclera.maxY, y);
            rightSclera.count++;
          }
        }
      }
    }
    
    console.log('Left Eye Sclera (White Area):');
    console.log(leftSclera);
    console.log('Center X:', (leftSclera.minX + leftSclera.maxX) / 2);
    console.log('Center Y:', (leftSclera.minY + leftSclera.maxY) / 2);
    console.log('Width:', leftSclera.maxX - leftSclera.minX);
    console.log('Height:', leftSclera.maxY - leftSclera.minY);

    console.log('\nRight Eye Sclera (White Area):');
    console.log(rightSclera);
    console.log('Center X:', (rightSclera.minX + rightSclera.maxX) / 2);
    console.log('Center Y:', (rightSclera.minY + rightSclera.maxY) / 2);
    console.log('Width:', rightSclera.maxX - rightSclera.minX);
    console.log('Height:', rightSclera.maxY - rightSclera.minY);

  });
