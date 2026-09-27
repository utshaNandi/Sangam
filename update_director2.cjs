const fs = require('fs');
let text = fs.readFileSync('src/components/director/DirectorCharacter.jsx', 'utf8');

// Replace left pupil coordinates
text = text.replace(/top:\s*'[\d\.]+%',\s*left:\s*'[\d\.]+%'/g, (match) => {
    if (match.includes('55.63%')) return "top: '23.68%', left: '57.42%'";
    if (match.includes('62.19%')) return "top: '23.78%', left: '61.65%'";
    return match;
});

// Update the pupil size to 5px to fit snugly in the squint
text = text.replace(/w-\[7px\] h-\[7px\]/g, 'w-[4px] h-[4px]');

// Tweak constraints so the pupil doesn't leave the small eye boundary
text = text.replace(/const maxMoveX = 3\.5;/g, 'const maxMoveX = 1.5;');
text = text.replace(/const maxMoveUp = 1\.0;/g, 'const maxMoveUp = 0.5;');
text = text.replace(/const maxMoveDown = 3\.5;/g, 'const maxMoveDown = 1.5;');

fs.writeFileSync('src/components/director/DirectorCharacter.jsx', text);
