const fs = require('fs');
const AdmZip = require('adm-zip');

const pptxPath = "C:\\Users\\Administrator\\Downloads\\macroeconomics.pptx";
const zip = new AdmZip(pptxPath);

console.log("=== ALL SHAPES IN SLIDE LAYOUT 12 ===");
const layoutEntry = zip.getEntry("ppt/slideLayouts/slideLayout12.xml");
if (layoutEntry) {
  const xml = layoutEntry.getData().toString('utf8');
  const shapeRegex = /<p:sp>([\s\S]*?)<\/p:sp>/g;
  let match;
  let idx = 0;
  while ((match = shapeRegex.exec(xml)) !== null) {
    idx++;
    const shapeContent = match[1];
    const phMatch = shapeContent.match(/<p:ph\s+([^>]*?)>/) || shapeContent.match(/<ph\s+([^>]*?)>/);
    console.log(`\n--- Shape ${idx} ---`);
    console.log("PH Tag:", phMatch ? phMatch[0] : "None");
    
    const offMatch = shapeContent.match(/<a:off\s+([^>]*?)>/) || shapeContent.match(/<off\s+([^>]*?)>/);
    const extMatch = shapeContent.match(/<a:ext\s+([^>]*?)>/) || shapeContent.match(/<ext\s+([^>]*?)>/);
    console.log("Off:", offMatch ? offMatch[0] : "None");
    console.log("Ext:", extMatch ? extMatch[0] : "None");
    
    const tRegex = /<a:t>([^<]*)<\/a:t>/g;
    let tMatch;
    let text = '';
    while ((tMatch = tRegex.exec(shapeContent)) !== null) {
      text += tMatch[1] + ' ';
    }
    if (text.trim()) console.log("Text:", text.trim());
  }
}
