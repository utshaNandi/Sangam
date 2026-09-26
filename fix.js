
const fs = require('fs');
let text = fs.readFileSync('src/pages/Director/DirectorAcademicSpacesView.jsx', 'utf8');
// Fix the literal '\n        </div>' issue
text = text.replace(/\\\\n\s+<\/div>/g, '');

// Re-add the </div> at the end of each node function
const funcs = ['ProgrammeNode', 'BranchNode', 'SpecializationNode', 'YearNode', 'SectionNode'];
for (const func of funcs) {
  const re = new RegExp('function ' + func + '[\\\\s\\\\S]*?return \\\\([\\\\s\\\\S]*?\\\\)\\;\\\\n\\\\}');
  text = text.replace(re, match => {
    let m = match.replace(/\\\\s*\\\\n\\\\s*\\\\n\\\\s*\\\\n\\\\s*\\\\n\\\\s*\\\\)\\\\;\\\\n\\\\}/, '\n            </div>\n          </div>\n        </div>\n      </div>\n    );\n}');
    m = m.replace(/\\\\s*\\\\n\\\\s*\\\\n\\\\s*\\\\)\\\\;\\\\n\\\\}/, '\n        </div>\n      </div>\n    );\n}');
    return m;
  });
}
fs.writeFileSync('src/pages/Director/DirectorAcademicSpacesView.jsx', text);

