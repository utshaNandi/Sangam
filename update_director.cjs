const fs = require('fs');
let text = fs.readFileSync('src/components/director/DirectorCharacter.jsx', 'utf8');

text = text.replace(/style=\{\{\s*filter:\s*'hue-rotate.*?\}\}/g, '');
text = text.replace(/top: '23.85%', left: '54.23%'/g, "top: '24.78%', left: '55.63%'");
text = text.replace(/top: '24.25%', left: '57.03%'/g, "top: '24.77%', left: '62.19%'");
text = text.replace(/w-\[5px\] h-\[5px\]/g, 'w-[7px] h-[7px]');
text = text.replace(/const maxMoveX = 2\.5;/g, 'const maxMoveX = 3.5;');
text = text.replace(/const maxMoveUp = 0\.5;/g, 'const maxMoveUp = 1.0;');
text = text.replace(/const maxMoveDown = 3\.0;/g, 'const maxMoveDown = 3.5;');

fs.writeFileSync('src/components/director/DirectorCharacter.jsx', text);
