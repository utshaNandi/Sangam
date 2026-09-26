const fs = require('fs');
const PNG = require('pngjs').PNG;

fs.createReadStream('src/assets/characters/director/director-character.png')
  .pipe(new PNG())
  .on('parsed', function() {
    let width = this.width;
    let height = this.height;
    
    // In director.png, the glasses lenses are distinct. 
    // Left eye is roughly x: 800-880, y: 220-270.
    // Right eye is roughly x: 910-980, y: 220-270.
    // Let's precisely find the darkest spots.
    
    function findCenterOfDarkestBlob(startX, endX, startY, endY) {
      let sumX = 0, sumY = 0, count = 0;
      for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
          let idx = (width * y + x) << 2;
          let r = this.data[idx];
          let g = this.data[idx+1];
          let b = this.data[idx+2];
          let a = this.data[idx+3];
          
          if (a > 200 && r < 50 && g < 50 && b < 50) {
            sumX += x;
            sumY += y;
            count++;
          }
        }
      }
      return count > 0 ? { x: sumX/count, y: sumY/count, w: Math.sqrt(count) } : null;
    }
    
    // Actually, to avoid hitting the glasses frames, let's just find the bounding box of the frames 
    // and then look inside.
    // To be perfectly safe, I will just print all dark pixels between 800 and 1000, 200 and 300
    // so I can see exactly where the pupils are vs the frames.
    
    let leftBlob = findCenterOfDarkestBlob.call(this, 830, 870, 240, 270);
    let rightBlob = findCenterOfDarkestBlob.call(this, 920, 960, 240, 270);
    
    console.log('Left Eye Center (px):', leftBlob);
    console.log('Right Eye Center (px):', rightBlob);
    
    if (leftBlob) {
        console.log('Left Eye Top %:', (leftBlob.y / height * 100).toFixed(2));
        console.log('Left Eye Left %:', (leftBlob.x / width * 100).toFixed(2));
    }
    if (rightBlob) {
        console.log('Right Eye Top %:', (rightBlob.y / height * 100).toFixed(2));
        console.log('Right Eye Left %:', (rightBlob.x / width * 100).toFixed(2));
    }
  });
