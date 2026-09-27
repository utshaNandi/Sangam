const fs = require('fs');
const PNG = require('pngjs').PNG;

fs.createReadStream('src/assets/characters/director/director-character.png')
  .pipe(new PNG())
  .on('parsed', function() {
    let width = this.width;
    
    console.log('--- LEFT EYE ---');
    for (let y = 230; y < 270; y++) {
      let line = '';
      for (let x = 860; x < 910; x++) {
        let idx = (width * y + x) << 2;
        let r = this.data[idx];
        let a = this.data[idx+3];
        if (a < 128) line += ' ';
        else if (r < 50) line += '#';
        else if (r > 200) line += '.';
        else line += '|';
      }
      console.log(y.toString().padStart(3) + ' ' + line);
    }

    console.log('--- RIGHT EYE ---');
    for (let y = 230; y < 270; y++) {
      let line = '';
      for (let x = 930; x < 980; x++) {
        let idx = (width * y + x) << 2;
        let r = this.data[idx];
        let a = this.data[idx+3];
        if (a < 128) line += ' ';
        else if (r < 50) line += '#';
        else if (r > 200) line += '.';
        else line += '|';
      }
      console.log(y.toString().padStart(3) + ' ' + line);
    }
  });
