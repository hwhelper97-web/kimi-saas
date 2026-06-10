const fs = require('fs');
const content = fs.readFileSync('qa_results.txt', 'utf16le');
console.log(content);
