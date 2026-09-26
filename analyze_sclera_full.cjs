const fs = require('fs');
const PNG = require('pngjs').PNG;

fs.createReadStream('src/assets/characters/director/director-character.png')
  .pipe(new PNG())
  .on('parsed', function() {
    let width = this.width;
    let leftSclera = { minX: 9999, maxX: 0, minY: 9999, maxY: 0, count: 0 };
    let rightSclera = { minX: 9999, maxX: 0, minY: 9999, maxY: 0, count: 0 };
    
    for (let y = 150; y < 350; y++) {
      for (let x = 800; x < 980; x++) {
        let idx = (width * y + x) << 2;
        let r = this.data[idx];
        let g = this.data[idx+1];
        let b = this.data[idx+2];
        let a = this.data[idx+3];
        
        if (a > 200 && r > 240 && g > 240 && b > 240) {
          if (x < 900) { 
            leftSclera.minX = Math.min(leftSclera.minX, x);
            leftSclera.maxX = Math.max(leftSclera.maxX, x);
            leftSclera.minY = Math.min(leftSclera.minY, y);
            leftSclera.maxY = Math.max(leftSclera.maxY, y);
            leftSclera.count++;
          } else { 
            rightSclera.minX = Math.min(rightSclera.minX, x);
            rightSclera.maxX = Math.max(rightSclera.maxX, x);
            rightSclera.minY = Math.min(rightSclera.minY, y);
            rightSclera.maxY = Math.max(rightSclera.maxY, y);
            rightSclera.count++;
          }
        }
      }
    }
    
    console.log('Left Lens (White Area):', leftSclera);
    let lCenterX = (leftSclera.minX + leftSclera.maxX) / 2;
    let lCenterY = (leftSclera.minY + leftSclera.maxY) / 2;
    console.log('Left Center X:', lCenterX, '(', (lCenterX/1536*100).toFixed(2), '% )');
    console.log('Left Center Y:', lCenterY, '(', (lCenterY/1024*100).toFixed(2), '% )');

    console.log('Right Lens (White Area):', rightSclera);
    let rCenterX = (rightSclera.minX + rightSclera.maxX) / 2;
    let rCenterY = (rightSclera.minY + rightSclera.maxY) / 2;
    console.log('Right Center X:', rCenterX, '(', (rCenterX/1536*100).toFixed(2), '% )');
    console.log('Right Center Y:', rCenterY, '(', (rCenterY/1024*100).toFixed(2), '% )');
  });
