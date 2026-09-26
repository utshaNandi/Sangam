const fs = require('fs');
const PNG = require('pngjs').PNG;

fs.createReadStream('src/assets/characters/director/director-character.png')
  .pipe(new PNG())
  .on('parsed', function() {
    let width = this.width;
    
    // Left eye is around X: 875-895, Y: 235-250
    // Right eye is around X: 945-965, Y: 235-250
    
    function getEyeBounds(startX, endX, startY, endY) {
      let minX = 9999, maxX = 0, minY = 9999, maxY = 0;
      for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
          let idx = (width * y + x) << 2;
          let r = this.data[idx];
          let g = this.data[idx+1];
          let b = this.data[idx+2];
          // Look for dark pixels (the eye lines)
          if (r < 100 && g < 100 && b < 100) {
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
          }
        }
      }
      return { minX, maxX, minY, maxY, centerX: (minX+maxX)/2, centerY: (minY+maxY)/2, w: maxX-minX, h: maxY-minY };
    }
    
    let leftEye = getEyeBounds(875, 895, 235, 255);
    let rightEye = getEyeBounds(945, 965, 235, 255);
    
    console.log("Left Eye Bounds:", leftEye);
    console.log("Left Eye Center %:", (leftEye.centerX / width * 100).toFixed(4), (leftEye.centerY / this.height * 100).toFixed(4));
    
    console.log("Right Eye Bounds:", rightEye);
    console.log("Right Eye Center %:", (rightEye.centerX / width * 100).toFixed(4), (rightEye.centerY / this.height * 100).toFixed(4));
  });
