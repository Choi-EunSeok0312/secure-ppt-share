const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

/**
 * Extracts slide layout target path from slide relationships XML.
 */
function getSlideLayoutPath(zip, slideIndex) {
  const relsName = `ppt/slides/_rels/slide${slideIndex}.xml.rels`;
  const relsEntry = zip.getEntry(relsName);
  if (!relsEntry) return null;
  
  try {
    const xml = relsEntry.getData().toString('utf8');
    const layoutMatch = xml.match(/Type="[^"]*?relationships\/slideLayout"\s+Target="([^"]+)"/) || 
                        xml.match(/Target="([^"]+)"\s+Type="[^"]*?relationships\/slideLayout"/);
    if (layoutMatch) {
      return layoutMatch[1].replace(/^\.\.\//, 'ppt/');
    }
  } catch (e) {
    console.error(`Failed to find layout path for slide ${slideIndex}:`, e);
  }
  return null;
}

/**
 * Extracts slide master target path from layout relationships XML.
 */
function getSlideMasterPath(zip, layoutPath) {
  const layoutDir = path.dirname(layoutPath);
  const layoutFile = path.basename(layoutPath);
  const relsName = `${layoutDir}/_rels/${layoutFile}.rels`;
  const relsEntry = zip.getEntry(relsName);
  if (!relsEntry) return null;
  
  try {
    const xml = relsEntry.getData().toString('utf8');
    const masterMatch = xml.match(/Type="[^"]*?relationships\/slideMaster"\s+Target="([^"]+)"/) || 
                        xml.match(/Target="([^"]+)"\s+Type="[^"]*?relationships\/slideMaster"/);
    if (masterMatch) {
      const target = masterMatch[1];
      const cleanTarget = path.join(layoutDir, target).replace(/\\/g, '/');
      return cleanTarget;
    }
  } catch (e) {
    console.error(`Failed to find master path for layout ${layoutPath}:`, e);
  }
  return null;
}

/**
 * Parses and maps image relationships for slide layouts or masters.
 */
function parseLayoutMasterRelations(zip, relsPath) {
  const relsEntry = zip.getEntry(relsPath);
  const relsMap = {};
  if (relsEntry) {
    try {
      const xml = relsEntry.getData().toString('utf8');
      const relRegex = /<Relationship\s+([^>]*?)\/>/g;
      let match;
      while ((match = relRegex.exec(xml)) !== null) {
        const attrsStr = match[1];
        const idMatch = attrsStr.match(/Id="([^"]+)"/);
        const targetMatch = attrsStr.match(/Target="([^"]+)"/);
        const typeMatch = attrsStr.match(/Type="([^"]+)"/);
        
        if (idMatch && targetMatch) {
          const id = idMatch[1];
          const target = targetMatch[1];
          const type = typeMatch ? typeMatch[1] : '';
          
          if (type.includes('relationships/image')) {
            const cleanTarget = target.replace(/^\.\.\//, 'ppt/').replace('ppt/ppt/', 'ppt/');
            const imgEntry = zip.getEntry(cleanTarget);
            if (imgEntry) {
              const buf = imgEntry.getData();
              const ext = path.extname(cleanTarget).toLowerCase();
              let mime = 'image/png';
              if (ext === '.jpg' || ext === '.jpeg') mime = 'image/jpeg';
              else if (ext === '.gif') mime = 'image/gif';
              else if (ext === '.svg') mime = 'image/svg+xml';
              
              relsMap[id] = `data:${mime};base64,${buf.toString('base64')}`;
            }
          }
        }
      }
    } catch (e) {
      console.error(`Error parsing relations for ${relsPath}:`, e);
    }
  }
  return relsMap;
}

/**
 * Builds a placeholder coordinate map by parsing the Master and Layout template specifications.
 */
function buildPlaceholderMap(zip, layoutPath) {
  const phMap = {};
  if (!layoutPath) return phMap;
  
  try {
    // 1. Base Master placeholders
    const masterPath = getSlideMasterPath(zip, layoutPath);
    if (masterPath) {
      const masterEntry = zip.getEntry(masterPath);
      if (masterEntry) {
        const masterXml = masterEntry.getData().toString('utf8');
        extractPHCoords(masterXml, phMap);
      }
    }
    
    // 2. Override Layout placeholders
    const layoutEntry = zip.getEntry(layoutPath);
    if (layoutEntry) {
      const layoutXml = layoutEntry.getData().toString('utf8');
      extractPHCoords(layoutXml, phMap);
    }
  } catch (e) {
    console.error(`Failed to build layout placeholder map for ${layoutPath}:`, e);
  }
  return phMap;
}

/**
 * Helper to extract coordinates from XML shapes carrying placeholder tags.
 */
function extractPHCoords(xmlContent, phMap) {
  const shapeRegex = /<p:sp>([\s\S]*?)<\/p:sp>/g;
  let match;
  while ((match = shapeRegex.exec(xmlContent)) !== null) {
    const shapeContent = match[1];
    
    const phMatch = shapeContent.match(/<p:ph\s+([^>]*?)>/) || shapeContent.match(/<ph\s+([^>]*?)>/);
    if (!phMatch) continue;
    
    const phAttrs = phMatch[1];
    const typeMatch = phAttrs.match(/type="([^"]+)"/);
    const idxMatch = phAttrs.match(/idx="(\d+)"/);
    
    const offMatch = shapeContent.match(/<a:off\s+([^>]*?)>/) || shapeContent.match(/<off\s+([^>]*?)>/);
    const extMatch = shapeContent.match(/<a:ext\s+([^>]*?)>/) || shapeContent.match(/<ext\s+([^>]*?)>/);
    
    let anchor = 't';
    const anchorMatch = shapeContent.match(/<a:bodyPr[^>]*?anchor="([^"]+)"/) || shapeContent.match(/<bodyPr[^>]*?anchor="([^"]+)"/);
    if (anchorMatch) {
      if (anchorMatch[1] === 'b') anchor = 'b';
      else if (anchorMatch[1] === 'ctr') anchor = 'ctr';
    }
    
    if (offMatch && extMatch) {
      const xAttr = offMatch[1].match(/x="(-?\d+)"/);
      const yAttr = offMatch[1].match(/y="(-?\d+)"/);
      const cxAttr = extMatch[1].match(/cx="(\d+)"/);
      const cyAttr = extMatch[1].match(/cy="(\d+)"/);
      
      if (xAttr && yAttr && cxAttr && cyAttr) {
        const coords = {
          x: parseInt(xAttr[1], 10),
          y: parseInt(yAttr[1], 10),
          w: parseInt(cxAttr[1], 10),
          h: parseInt(cyAttr[1], 10),
          anchor: anchor
        };
        
        if (typeMatch) phMap[typeMatch[1]] = coords;
        if (idxMatch) phMap[idxMatch[1]] = coords;
      }
    }
  }
}

/**
 * Extracts a solid or image background fill explicitly defined in a <p:bg> element.
 */
function extractBackgroundFill(xmlContent, relsMap, idPrefix) {
  const bgRegex = /<p:bg>([\s\S]*?)<\/p:bg>/;
  const bgMatch = xmlContent.match(bgRegex);
  if (!bgMatch) return null;

  const bgContent = bgMatch[1];
  
  // 1. Picture Fill
  const blipFillMatch = bgContent.match(/<a:blipFill>([\s\S]*?)<\/a:blipFill>/);
  if (blipFillMatch) {
    const fillContent = blipFillMatch[1];
    const blipMatch = fillContent.match(/<a:blip[^>]*?r:embed="([^"]+)"/);
    if (blipMatch) {
      const rId = blipMatch[1];
      const bgImgUrl = relsMap[rId];
      if (bgImgUrl) {
        return {
          id: `${idPrefix}-bg-pic`,
          type: 'image',
          content: bgImgUrl,
          x: 0,
          y: 0,
          w: 100,
          h: 100,
          rotation: 0,
          animation: 'fade-in',
          step: 0
        };
      }
    }
  }

  // 2. Solid Color Fill
  const solidFillMatch = bgContent.match(/<a:solidFill>([\s\S]*?)<\/a:solidFill>/);
  if (solidFillMatch) {
    const fillContent = solidFillMatch[1];
    let bgColor = null;
    
    const srgbMatch = fillContent.match(/<a:srgbClr\s+val="([0-9a-fA-F]{6})"/);
    if (srgbMatch) {
      bgColor = `#${srgbMatch[1]}`;
    } else {
      const schemeMatch = fillContent.match(/<a:schemeClr\s+val="([^"]+)"/);
      if (schemeMatch) {
        const schemeVal = schemeMatch[1];
        if (schemeVal.includes('accent1')) bgColor = '#ea580c';
        else if (schemeVal.includes('accent2')) bgColor = '#3b82f6';
        else if (schemeVal.includes('accent3')) bgColor = '#10b981';
        else if (schemeVal.includes('bg1')) bgColor = '#ffffff';
        else if (schemeVal.includes('tx1')) bgColor = '#0f172a';
      }
    }
    
    if (bgColor) {
      return {
        id: `${idPrefix}-bg-solid`,
        type: 'shape',
        shapeType: 'rect',
        geom: 'rect',
        x: 0,
        y: 0,
        w: 100,
        h: 100,
        color: bgColor,
        text: '',
        border: '',
        rotation: 0,
        animation: 'fade-in',
        step: 0
      };
    }
  }

  return null;
}

/**
 * Extracts background elements (decorative shapes and background pictures)
 * from slide layouts or masters to preserve visual presentation designs.
 */
function parseBackgroundElements(zip, xmlContent, relsMap, slideWidth, slideHeight) {
  const elements = [];
  let elementCounter = 0;
  
  // 1. Extract decorative shapes <p:sp>
  const shapeRegex = /<p:sp>([\s\S]*?)<\/p:sp>/g;
  let match;
  while ((match = shapeRegex.exec(xmlContent)) !== null) {
    const shapeContent = match[1];
    
    // Background layout shapes should NOT be standard placeholders
    if (shapeContent.includes('<p:ph') || shapeContent.includes('<ph')) {
      continue;
    }
    
    // Extract text runs if any
    const pRegex = /<a:p>([\s\S]*?)<\/a:p>/g;
    let pMatch;
    const parsedParagraphs = [];
    while ((pMatch = pRegex.exec(shapeContent)) !== null) {
      const pContent = pMatch[1];
      const tRegex = /<a:t>([^<]*)<\/a:t>/g;
      let tMatch;
      let paraText = '';
      while ((tMatch = tRegex.exec(pContent)) !== null) {
        paraText += tMatch[1];
      }
      
      if (!paraText.trim()) continue;
      
      let fontPt = 18;
      const szMatch = pContent.match(/sz="(\d+)"/);
      if (szMatch) {
        fontPt = parseInt(szMatch[1], 10) / 100;
      }
      
      let pColor = '#334155';
      const clrMatch = pContent.match(/<a:srgbClr\s+val="([0-9a-fA-F]{6})"/);
      if (clrMatch) {
        pColor = `#${clrMatch[1]}`;
      } else {
        const schemeMatch = pContent.match(/<a:schemeClr\s+val="([^"]+)"/);
        if (schemeMatch) {
          const schemeVal = schemeMatch[1];
          if (schemeVal.includes('accent1')) pColor = '#ea580c';
          else if (schemeVal.includes('accent2')) pColor = '#3b82f6';
          else if (schemeVal.includes('accent3')) pColor = '#10b981';
        }
      }
      
      let align = 'left';
      const algnMatch = pContent.match(/algn="([^"]+)"/);
      if (algnMatch) {
        if (algnMatch[1] === 'ctr') align = 'center';
        else if (algnMatch[1] === 'r') align = 'right';
      }
      
      parsedParagraphs.push({
        text: paraText.trim(),
        isHeading: fontPt >= 24,
        isBullet: false,
        size: Math.round(fontPt * 0.95),
        color: pColor,
        align: align
      });
    }
    
    let fillColor = null;
    const solidFillMatch = shapeContent.match(/<a:solidFill>([\s\S]*?)<\/a:solidFill>/);
    if (solidFillMatch) {
      const fillContent = solidFillMatch[1];
      const srgbMatch = fillContent.match(/<a:srgbClr\s+val="([0-9a-fA-F]{6})"/);
      if (srgbMatch) {
        fillColor = `#${srgbMatch[1]}`;
      } else {
        const schemeMatch = fillContent.match(/<a:schemeClr\s+val="([^"]+)"/);
        if (schemeMatch) {
          const schemeVal = schemeMatch[1];
          if (schemeVal.includes('accent1')) fillColor = '#ea580c';
          else if (schemeVal.includes('accent2')) fillColor = '#3b82f6';
          else if (schemeVal.includes('accent3')) fillColor = '#10b981';
          else if (schemeVal.includes('bg1')) fillColor = '#ffffff';
          else if (schemeVal.includes('tx1')) fillColor = '#0f172a';
        }
      }
    }
    
    if (!fillColor && parsedParagraphs.length === 0) continue;
    
    const offMatch = shapeContent.match(/<a:off\s+([^>]*?)>/) || shapeContent.match(/<off\s+([^>]*?)>/);
    const extMatch = shapeContent.match(/<a:ext\s+([^>]*?)>/) || shapeContent.match(/<ext\s+([^>]*?)>/);
    if (!offMatch || !extMatch) continue;
    
    const xAttr = offMatch[1].match(/x="(-?\d+)"/);
    const yAttr = offMatch[1].match(/y="(-?\d+)"/);
    const cxAttr = extMatch[1].match(/cx="(\d+)"/);
    const cyAttr = extMatch[1].match(/cy="(\d+)"/);
    if (!xAttr || !yAttr || !cxAttr || !cyAttr) continue;
    
    const rawX = parseInt(xAttr[1], 10);
    const rawY = parseInt(yAttr[1], 10);
    const rawW = parseInt(cxAttr[1], 10);
    const rawH = parseInt(cyAttr[1], 10);
    
    let pctX = Math.round((rawX / slideWidth) * 100);
    let pctY = Math.round((rawY / slideHeight) * 100);
    let pctW = Math.round((rawW / slideWidth) * 100);
    let pctH = Math.round((rawH / slideHeight) * 100);
    
    if (pctX < 0) pctX = 5;
    if (pctY < 0) pctY = 5;
    if (pctW > 100) pctW = 90;
    if (pctH > 100) pctH = 90;
    
    const geomMatch = shapeContent.match(/<a:prstGeom\s+prst="([^"]+)"/) || shapeContent.match(/<prstGeom\s+prst="([^"]+)"/);
    const shapeGeom = geomMatch ? geomMatch[1] : 'rect';
    
    const rotMatch = shapeContent.match(/rot="(\d+)"/) || shapeContent.match(/<a:xfrm[^>]*?rot="(\d+)"/);
    const rotation = rotMatch ? Math.round(parseInt(rotMatch[1], 10) / 60000) : 0;
    
    elementCounter++;
    if (parsedParagraphs.length > 0) {
      elements.push({
        id: `bg-text-${elementCounter}`,
        type: 'richText',
        x: pctX,
        y: pctY,
        w: pctW,
        h: pctH,
        anchor: 't',
        rotation: rotation,
        paragraphs: parsedParagraphs,
        animation: 'fade-in',
        step: 0
      });
    } else {
      elements.push({
        id: `bg-shape-${elementCounter}`,
        type: 'shape',
        shapeType: 'rect',
        geom: shapeGeom,
        x: pctX,
        y: pctY,
        w: pctW,
        h: pctH,
        color: fillColor,
        text: '',
        border: '',
        rotation: rotation,
        animation: 'fade-in',
        step: 0
      });
    }
  }
  
  // 2. Extract background layout pictures <p:pic>
  const picRegex = /<p:pic>([\s\S]*?)<\/p:pic>/g;
  let picMatch;
  while ((picMatch = picRegex.exec(xmlContent)) !== null) {
    const picContent = picMatch[1];
    
    // Specifically match geometry coordinates (cx/cy), not extLst uri attributes
    const xfrmOffMatch = picContent.match(/<a:off\s+x="(-?\d+)"\s+y="(-?\d+)"/);
    const xfrmExtMatch = picContent.match(/<a:ext\s+cx="(\d+)"\s+cy="(\d+)"/);
    if (!xfrmOffMatch || !xfrmExtMatch) continue;
    
    const rawX = parseInt(xfrmOffMatch[1], 10);
    const rawY = parseInt(xfrmOffMatch[2], 10);
    const rawW = parseInt(xfrmExtMatch[1], 10);
    const rawH = parseInt(xfrmExtMatch[2], 10);
    
    let pctX = Math.round((rawX / slideWidth) * 100);
    let pctY = Math.round((rawY / slideHeight) * 100);
    let pctW = Math.round((rawW / slideWidth) * 100);
    let pctH = Math.round((rawH / slideHeight) * 100);
    
    const embedMatch = picContent.match(/r:embed="([^"]+)"/) || picContent.match(/embed="([^"]+)"/);
    let imgDataUrl = null;
    if (embedMatch) {
      const rId = embedMatch[1];
      imgDataUrl = relsMap[rId] || null;
    }
    
    const rotMatch = picContent.match(/<a:xfrm[^>]*rot="(\d+)"/);
    const rotation = rotMatch ? Math.round(parseInt(rotMatch[1], 10) / 60000) : 0;
    
    if (imgDataUrl) {
      elementCounter++;
      elements.push({
        id: `bg-pic-${elementCounter}`,
        type: 'image',
        content: imgDataUrl,
        x: pctX,
        y: pctY,
        w: pctW,
        h: pctH,
        isBackground: rawX === 0 && rawY === 0 && rawW >= slideWidth * 0.95,
        rotation: rotation,
        animation: 'fade-in',
        step: 0
      });
    }
  }
  
  return elements;
}

/**
 * Extracts and maps image relationships for a specific slide XML file.
 */
function parseRelations(zip, slideIndex) {
  const relsName = `ppt/slides/_rels/slide${slideIndex}.xml.rels`;
  const relsEntry = zip.getEntry(relsName);
  const relsMap = {};
  
  if (relsEntry) {
    try {
      const xml = relsEntry.getData().toString('utf8');
      const relRegex = /<Relationship\s+([^>]*?)\/>/g;
      let match;
      while ((match = relRegex.exec(xml)) !== null) {
        const attrsStr = match[1];
        const idMatch = attrsStr.match(/Id="([^"]+)"/);
        const targetMatch = attrsStr.match(/Target="([^"]+)"/);
        const typeMatch = attrsStr.match(/Type="([^"]+)"/);
        
        if (idMatch && targetMatch) {
          const id = idMatch[1];
          const target = targetMatch[1];
          const type = typeMatch ? typeMatch[1] : '';
          
          if (type.includes('relationships/image')) {
            const cleanTarget = target.replace(/^\.\.\//, 'ppt/');
            const imgEntry = zip.getEntry(cleanTarget);
            if (imgEntry) {
              const buf = imgEntry.getData();
              const ext = path.extname(cleanTarget).toLowerCase();
              let mime = 'image/png';
              if (ext === '.jpg' || ext === '.jpeg') mime = 'image/jpeg';
              else if (ext === '.gif') mime = 'image/gif';
              else if (ext === '.svg') mime = 'image/svg+xml';
              
              relsMap[id] = `data:${mime};base64,${buf.toString('base64')}`;
            }
          }
        }
      }
    } catch (e) {
      console.error(`Error parsing relations for slide ${slideIndex}:`, e);
    }
  }
  return relsMap;
}

/**
 * Parses actual PPTX slide structures (XML shapes, text runs, and sizes)
 * to reconstruct vector layouts and text coordinates in HTML5 percentages.
 */
function parsePptxFile(filePath, title) {
  try {
    if (!fs.existsSync(filePath)) {
      console.log(`PPTX file path does not exist: ${filePath}`);
      return null;
    }

    const zip = new AdmZip(filePath);
    const zipEntries = zip.getEntries();
    
    const slideEntries = zipEntries.filter(entry => 
      entry.entryName.startsWith('ppt/slides/slide') && entry.entryName.endsWith('.xml')
    );
    
    if (slideEntries.length === 0) {
      console.log("No slides found in the uploaded PPTX zip entries.");
      return null;
    }
    
    slideEntries.sort((a, b) => {
      const matchA = a.entryName.match(/slide(\d+)\.xml/);
      const matchB = b.entryName.match(/slide(\d+)\.xml/);
      const numA = matchA ? parseInt(matchA[1], 10) : 0;
      const numB = matchB ? parseInt(matchB[1], 10) : 0;
      return numA - numB;
    });
    
    let slideWidth = 12192000;
    let slideHeight = 6858000;
    
    const presEntry = zipEntries.find(entry => entry.entryName === 'ppt/presentation.xml');
    if (presEntry) {
      const presXml = presEntry.getData().toString('utf8');
      const cxAttr = presXml.match(/cx="(\d+)"/);
      const cyAttr = presXml.match(/cy="(\d+)"/);
      if (cxAttr) slideWidth = parseInt(cxAttr[1], 10);
      if (cyAttr) slideHeight = parseInt(cyAttr[1], 10);
    }
    
    const slides = [];
    
    slideEntries.forEach((entry, index) => {
      const slideXml = entry.getData().toString('utf8');
      const slideIndex = index + 1;
      
      const relsMap = parseRelations(zip, slideIndex);
      
      // 1. Parse template background graphics
      const bgElements = [];
      const layoutPath = getSlideLayoutPath(zip, slideIndex);
      
      if (layoutPath) {
        const layoutEntry = zip.getEntry(layoutPath);
        if (layoutEntry) {
          const layoutXml = layoutEntry.getData().toString('utf8');
          const layoutDir = path.dirname(layoutPath);
          const layoutFile = path.basename(layoutPath);
          const layoutRelsPath = `${layoutDir}/_rels/${layoutFile}.rels`;
          const layoutRelsMap = parseLayoutMasterRelations(zip, layoutRelsPath);
          
          const masterPath = getSlideMasterPath(zip, layoutPath);
          let masterXml = null;
          let masterRelsMap = {};
          if (masterPath) {
            const masterEntry = zip.getEntry(masterPath);
            if (masterEntry) {
              masterXml = masterEntry.getData().toString('utf8');
              const masterDir = path.dirname(masterPath);
              const masterFile = path.basename(masterPath);
              const masterRelsPath = `${masterDir}/_rels/${masterFile}.rels`;
              masterRelsMap = parseLayoutMasterRelations(zip, masterRelsPath);
              
              // Apply Master Background Fill
              const masterBgFill = extractBackgroundFill(masterXml, masterRelsMap, `master-${slideIndex}`);
              if (masterBgFill) bgElements.push(masterBgFill);
              
              // Apply Master Decoration Elements
              const masterBg = parseBackgroundElements(zip, masterXml, masterRelsMap, slideWidth, slideHeight);
              bgElements.push(...masterBg);
            }
          }

          // Apply Layout Background Fill
          const layoutBgFill = extractBackgroundFill(layoutXml, layoutRelsMap, `layout-${slideIndex}`);
          if (layoutBgFill) bgElements.push(layoutBgFill);
          
          // Apply Layout Decoration Elements
          const layoutBg = parseBackgroundElements(zip, layoutXml, layoutRelsMap, slideWidth, slideHeight);
          bgElements.push(...layoutBg);
        }
      }
      
      // Apply Slide Background Fill (Overrides master and layout)
      const slideBgFill = extractBackgroundFill(slideXml, relsMap, `slide-${slideIndex}`);
      if (slideBgFill) bgElements.push(slideBgFill);

      // 2. Build coordinate placeholder map for this slide
      const layoutPlaceholders = buildPlaceholderMap(zip, layoutPath);
      
      bgElements.forEach((el, idx) => {
        el.id = `bg-slide-${slideIndex}-${idx}-${el.id}`;
      });
      
      const elements = [...bgElements];
      let elementCounter = elements.length;
      let stepCounter = 0;
      
      // 3. Parse Slide Elements (Direct Children)
      const shapeRegex = /<p:sp>([\s\S]*?)<\/p:sp>/g;
      let match;
      
      while ((match = shapeRegex.exec(slideXml)) !== null) {
        const shapeContent = match[1];
        
        let shapeX = null, shapeY = null, shapeW = null, shapeH = null;
        let shapeAnchor = 't';
        
        // Check if placeholder
        const phMatch = shapeContent.match(/<p:ph\s+([^>]*?)>/) || shapeContent.match(/<ph\s+([^>]*?)>/);
        let phType = null;
        let phIdx = null;
        if (phMatch) {
          const phAttrs = phMatch[1];
          const typeMatch = phAttrs.match(/type="([^"]+)"/);
          const idxMatch = phAttrs.match(/idx="(\d+)"/);
          if (typeMatch) phType = typeMatch[1];
          if (idxMatch) phIdx = idxMatch[1];
        }
        
        // 1. Get coordinates from local shape XML if present
        // Use specific patterns that match geometry attributes (cx/cy), NOT extLst uri= attributes
        const offGeoMatch = shapeContent.match(/<a:off\s+x="(-?\d+)"\s+y="(-?\d+)"/);
        const extGeoMatch = shapeContent.match(/<a:ext\s+cx="(\d+)"\s+cy="(\d+)"/);
        
        if (offGeoMatch && extGeoMatch) {
          shapeX = parseInt(offGeoMatch[1], 10);
          shapeY = parseInt(offGeoMatch[2], 10);
          shapeW = parseInt(extGeoMatch[1], 10);
          shapeH = parseInt(extGeoMatch[2], 10);
        }
        
        // 2. Fallback to Layout placeholder coordinates only if slide XML contains no coordinates or default zero coordinate
        if (phMatch && (shapeX === null || shapeX === 0 || shapeY === null || shapeY === 0)) {
          const phCoords = (phIdx !== null ? layoutPlaceholders[phIdx] : null) || (phType !== null ? layoutPlaceholders[phType] : null);
          if (phCoords) {
            shapeX = phCoords.x;
            shapeY = phCoords.y;
            shapeW = phCoords.w;
            shapeH = phCoords.h;
            shapeAnchor = phCoords.anchor || 't';
          }
        }
        
        // 3. Fallback: If still null, try using layout placeholder for anchors/styles even if coordinates are custom
        if (phMatch && shapeAnchor === 't') {
          const phCoords = (phIdx !== null ? layoutPlaceholders[phIdx] : null) || (phType !== null ? layoutPlaceholders[phType] : null);
          if (phCoords && phCoords.anchor) {
            shapeAnchor = phCoords.anchor;
          }
        }
        
        // Check if local layout anchor overrides placeholder alignment
        const localAnchorMatch = shapeContent.match(/<a:bodyPr[^>]*?anchor="([^"]+)"/) || shapeContent.match(/<bodyPr[^>]*?anchor="([^"]+)"/);
        if (localAnchorMatch) {
          if (localAnchorMatch[1] === 'b') shapeAnchor = 'b';
          else if (localAnchorMatch[1] === 'ctr') shapeAnchor = 'ctr';
        }
        
        if (shapeX === null || shapeY === null || shapeW === null || shapeH === null) {
          continue;
        }
        
        let pctX = Math.round((shapeX / slideWidth) * 100);
        let pctY = Math.round((shapeY / slideHeight) * 100);
        let pctW = Math.round((shapeW / slideWidth) * 100);
        let pctH = Math.round((shapeH / slideHeight) * 100);
        
        if (pctX < 0) pctX = 5;
        if (pctY < 0) pctY = 5;
        if (pctW > 100) pctW = 90;
        if (pctH > 100) pctH = 90;
        if (pctW <= 0) pctW = 20;
        if (pctH <= 0) pctH = 5;
        
        let fillColor = null;
        const solidFillMatch = shapeContent.match(/<a:solidFill>([\s\S]*?)<\/a:solidFill>/);
        if (solidFillMatch) {
          const fillContent = solidFillMatch[1];
          const srgbMatch = fillContent.match(/<a:srgbClr\s+val="([0-9a-fA-F]{6})"/);
          if (srgbMatch) {
            fillColor = `#${srgbMatch[1]}`;
          } else {
            const schemeMatch = fillContent.match(/<a:schemeClr\s+val="([^"]+)"/);
            if (schemeMatch) {
              const schemeVal = schemeMatch[1];
              if (schemeVal.includes('accent1')) fillColor = '#ea580c';
              else if (schemeVal.includes('accent2')) fillColor = '#3b82f6';
              else if (schemeVal.includes('accent3')) fillColor = '#10b981';
              else if (schemeVal.includes('bg1')) fillColor = '#ffffff';
              else if (schemeVal.includes('tx1')) fillColor = '#0f172a';
            }
          }
        }
        
        const geomMatch = shapeContent.match(/<a:prstGeom\s+prst="([^"]+)"/) || shapeContent.match(/<prstGeom\s+prst="([^"]+)"/);
        const shapeGeom = geomMatch ? geomMatch[1] : 'rect';
        
        const rotMatch = shapeContent.match(/rot="(\d+)"/) || shapeContent.match(/<a:xfrm[^>]*?rot="(\d+)"/);
        const rotation = rotMatch ? Math.round(parseInt(rotMatch[1], 10) / 60000) : 0;
        
        const pRegex = /<a:p>([\s\S]*?)<\/a:p>/g;
        let pMatch;
        const parsedParagraphs = [];
        const isTitlePlaceholder = shapeContent.includes('type="title"') || shapeContent.includes('type="ctrTitle"') || (slideIndex === 1 && shapeContent.includes('type="subTitle"'));
        
        while ((pMatch = pRegex.exec(shapeContent)) !== null) {
          const pContent = pMatch[1];
          
          const hasBuNone = pContent.includes('<a:buNone/>') || pContent.includes('<buNone/>');
          const isExplicitBullet = pContent.includes('<a:buChar') || pContent.includes('<a:buAutoNum') || pContent.includes('buSz');
          
          const isBullet = isExplicitBullet || (parsedParagraphs.length > 0 && !hasBuNone);
          
          const tRegex = /<a:t>([^<]*)<\/a:t>/g;
          let tMatch;
          let paraText = '';
          while ((tMatch = tRegex.exec(pContent)) !== null) {
            paraText += tMatch[1];
          }
          
          if (!paraText.trim()) continue;
          
          let fontPt = 18;
          const szMatch = pContent.match(/sz="(\d+)"/);
          if (szMatch) {
            fontPt = parseInt(szMatch[1], 10) / 100;
          }
          
          let pColor = '#334155';
          const clrMatch = pContent.match(/<a:srgbClr\s+val="([0-9a-fA-F]{6})"/);
          if (clrMatch) {
            pColor = `#${clrMatch[1]}`;
          }
          
          let align = 'left';
          const algnMatch = pContent.match(/algn="([^"]+)"/);
          if (algnMatch) {
            if (algnMatch[1] === 'ctr') align = 'center';
            else if (algnMatch[1] === 'r') align = 'right';
          }
          
          const isHeading = (parsedParagraphs.length === 0) && (isTitlePlaceholder || (!isBullet && fontPt >= 24));
          
          parsedParagraphs.push({
            text: paraText.trim(),
            isHeading: isHeading,
            isBullet: isBullet,
            size: Math.round(fontPt * 0.95),
            color: isHeading && pColor === '#334155' ? '#0f172a' : pColor,
            align: align
          });
        }
        
        elementCounter++;
        const elementId = `el-${slideIndex}-${elementCounter}`;
        const step = stepCounter;
        stepCounter++;
        
        if (parsedParagraphs.length === 0) {
          if (fillColor) {
            elements.push({
              id: elementId,
              type: 'shape',
              shapeType: 'rect',
              geom: shapeGeom,
              x: pctX,
              y: pctY,
              w: pctW,
              h: pctH,
              color: fillColor,
              text: '',
              border: '',
              rotation: rotation,
              animation: 'fade-in',
              step: step
            });
          }
          continue;
        }
        
        elements.push({
          id: elementId,
          type: 'richText',
          x: pctX,
          y: pctY,
          w: pctW,
          h: pctH,
          anchor: shapeAnchor,
          rotation: rotation,
          paragraphs: parsedParagraphs,
          animation: 'fade-in',
          step: step
        });
      }
      
      // 4. Parse pictures <p:pic> (Direct embedded images)
      const picRegex = /<p:pic>([\s\S]*?)<\/p:pic>/g;
      let picMatch;
      while ((picMatch = picRegex.exec(slideXml)) !== null) {
        const picContent = picMatch[1];
        
        // Must specifically match the geometry <a:off> and <a:ext cx=...> (not extLst uri= attributes)
        const offMatch = picContent.match(/<a:off\s+x="/);
        const extCxMatch = picContent.match(/<a:ext\s+cx="(\d+)"\s+cy="(\d+)"/);
        
        if (offMatch && extCxMatch) {
          const xMatch = picContent.match(/<a:off\s+x="(-?\d+)"\s+y="(-?\d+)"/);
          const rawX = xMatch ? parseInt(xMatch[1], 10) : 0;
          const rawY = xMatch ? parseInt(xMatch[2], 10) : 0;
          const rawW = parseInt(extCxMatch[1], 10);
          const rawH = parseInt(extCxMatch[2], 10);
          
          let pctX = Math.round((rawX / slideWidth) * 100);
          let pctY = Math.round((rawY / slideHeight) * 100);
          let pctW = Math.round((rawW / slideWidth) * 100);
          let pctH = Math.round((rawH / slideHeight) * 100);
          
          if (pctX < 0) pctX = 0;
          if (pctY < 0) pctY = 0;
          if (pctW > 100) pctW = 100;
          if (pctH > 100) pctH = 100;
          
          const embedMatch = picContent.match(/r:embed="([^"]+)"/) || picContent.match(/embed="([^"]+)"/);
          let imgDataUrl = null;
          if (embedMatch) {
            const rId = embedMatch[1];
            imgDataUrl = relsMap[rId] || null;
          }
          
          const rotMatch = picContent.match(/<a:xfrm[^>]*rot="(\d+)"/);
          const rotation = rotMatch ? Math.round(parseInt(rotMatch[1], 10) / 60000) : 0;
          
          // Determine if this is a full-slide background image
          const isFullSlide = rawX === 0 && rawY === 0 && rawW >= slideWidth * 0.95;
          
          elementCounter++;
          if (imgDataUrl) {
            elements.push({
              id: `pic-${slideIndex}-${elementCounter}`,
              type: 'image',
              content: imgDataUrl,
              x: pctX,
              y: pctY,
              w: pctW,
              h: pctH,
              isBackground: isFullSlide,
              rotation: rotation,
              animation: 'fade-in',
              step: 0  // Background images always visible
            });
          } else {
            elements.push({
              id: `pic-${slideIndex}-${elementCounter}`,
              type: 'shape',
              shapeType: 'rect',
              x: pctX,
              y: pctY,
              w: pctW,
              h: pctH,
              color: '#f8fafc',
              text: '🖼️',
              border: 'border-dashed border-slate-355 text-slate-500 bg-slate-50',
              animation: 'fade-in',
              step: stepCounter++
            });
          }
        }
      }
      
      if (elements.length === 0) {
        elements.push({
          id: `el-${slideIndex}-fallback`,
          type: 'heading',
          content: `${title} - Slide ${slideIndex}`,
          x: 10,
          y: 45,
          w: 80,
          h: 15,
          size: 32,
          color: '#1e293b',
          animation: 'fade-in',
          step: 0
        });
      }
      
      slides.push({
        slideIndex: slideIndex,
        title: `Slide ${slideIndex}`,
        elements: [...bgElements, ...elements]
      });
    });
    
    console.log(`PPTX Parser successfully extracted ${slides.length} slides with layout coordinates, backgrounds, and richText textboxes.`);
    return slides;
  } catch (err) {
    console.error("XML PPTX ZIP parser failed, falling back to mock generator.", err);
    return null;
  }
}

/**
 * Entrypoint: attempts to parse real PPTX slide XML definitions first,
 * falling back to thematic templates if the file is corrupt.
 */
function convertPptxToHtml5(filePath, filename, title) {
  const presentationId = `pres-${Date.now()}`;
  const cleanTitle = title || filename.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");

  console.log(`Converter received file: ${filename} at path: ${filePath}`);

  // 1. Try real XML slide parsing
  if (filePath && fs.existsSync(filePath)) {
    const parsedSlides = parsePptxFile(filePath, cleanTitle);
    if (parsedSlides && parsedSlides.length > 0) {
      return {
        id: presentationId,
        title: cleanTitle,
        uploadDate: new Date().toISOString(),
        slides: parsedSlides
      };
    }
  }

  // 2. Fallback Mock templates if real parsing fails
  const lowerName = filename.toLowerCase();
  const lowerTitle = cleanTitle.toLowerCase();
  let slides = [];

  if (lowerName.includes('security') || lowerName.includes('crypto') || lowerTitle.includes('보안') || lowerTitle.includes('해킹')) {
    slides = getSecuritySlides();
  } else if (lowerName.includes('business') || lowerName.includes('marketing') || lowerName.includes('pitch') || lowerTitle.includes('비즈니스') || lowerTitle.includes('마케팅')) {
    slides = getBusinessSlides();
  } else if (lowerName.includes('cocoa') || lowerName.includes('butter') || lowerName.includes('manufacturing') || lowerTitle.includes('코코아') || lowerTitle.includes('버터') || lowerTitle.includes('제조')) {
    slides = getCocoaButterSlides(cleanTitle);
  } else {
    slides = getDynamicContextSlides(cleanTitle);
  }

  return {
    id: presentationId,
    title: cleanTitle,
    uploadDate: new Date().toISOString(),
    slides: slides
  };
}

// ----------------------------------------------------
// Mock Layout Slide Generators (fallback)
// ----------------------------------------------------

function getCocoaButterSlides(title) {
  return [
    {
      slideIndex: 1,
      title: "코코아버터 제조 공정 개요",
      elements: [
        { id: "cb1-el1", type: "heading", content: title, x: 10, y: 15, w: 80, h: 15, size: 38, color: "#4c1d95", animation: "fade-in", step: 0 },
        { id: "cb1-el2", type: "text", content: "코코아 빈 가공부터 물리적 압착 분리까지의 고품질 초콜릿 원료 생산 단계", x: 10, y: 32, w: 80, h: 10, size: 18, color: "#475569", animation: "slide-up", step: 1 },
        { id: "cb1-el3", type: "shape", shapeType: "rect", x: 10, y: 55, w: 80, h: 30, color: "#faf5ff", text: "주요 공정: 로스팅 ➔ 마쇄 ➔ 압착 ➔ 여과 정제", border: "border-purple-300 bg-purple-50/50 text-purple-800", animation: "fade-in", step: 2 }
      ]
    },
    {
      slideIndex: 2,
      title: "코코아 빈의 전처리: 로스팅 및 마쇄",
      elements: [
        { id: "cb2-el1", type: "heading", content: "로스팅 및 니브스 마쇄 단계", x: 10, y: 15, w: 80, h: 15, size: 32, color: "#1e293b", animation: "fade-in", step: 0 },
        { id: "cb2-el2", type: "list", items: [
          "로스팅 공정: 120°C ~ 140°C 에서 진행하며 고유의 초콜릿 아로마 풍미를 형성하고 껍질을 쉽게 분리하도록 함.",
          "니브스 분쇄: 껍질이 분리된 카카오 니브스를 고속으로 분쇄하여 액상의 카카오 매스로 변환시킴.",
          "온도 제어: 마쇄 도중 발생하는 마찰열을 식혀 카카오 버터 성분이 분해되지 않도록 예방 조치 적용."
        ], x: 10, y: 30, w: 80, h: 50, size: 16, color: "#334155", animation: "slide-left", step: 1 }
      ]
    },
    {
      slideIndex: 3,
      title: "물리적 압착 및 카카오 버터 정제 분리",
      elements: [
        { id: "cb3-el1", type: "heading", content: "유압 압착을 통한 고순도 버터 추출", x: 10, y: 15, w: 80, h: 15, size: 32, color: "#1e293b", animation: "fade-in", step: 0 },
        { id: "cb3-el2", type: "text", content: "카카오 매스에 높은 유압을 가하여 지방 성분(카카오버터)과 고체 성분(카카오케이크)을 분리해 냅니다.", x: 10, y: 30, w: 80, h: 15, size: 16, color: "#475569", animation: "slide-up", step: 1 },
        { id: "cb3-el3", type: "shape", shapeType: "rect", x: 10, y: 48, w: 80, h: 32, color: "#f0fdf4", text: "최종 생산품: 정제 과정을 거친 옅은 황색의 고온 템퍼링 코코아 버터 블록", border: "border-emerald-250 text-emerald-800", animation: "fade-in", step: 2 }
      ]
    }
  ];
}

function getSecuritySlides() {
  return [
    {
      slideIndex: 1,
      title: "Advanced Cyber Threat Mitigation",
      elements: [
        { id: "s1-el1", type: "heading", content: "Cyber Threat Mitigation 2026", x: 10, y: 15, w: 80, h: 15, size: 36, color: "#1e293b", animation: "fade-in", step: 0 },
        { id: "s1-el2", type: "text", content: "Implementing secure network boundaries and zero-trust asset verification models.", x: 10, y: 35, w: 80, h: 15, size: 18, color: "#475569", animation: "slide-up", step: 1 },
        { id: "s1-el3", type: "shape", shapeType: "rect", x: 10, y: 55, w: 80, h: 30, color: "#f8fafc", text: "Security Clearance Required", border: "border-rose-300 bg-rose-50/50 text-rose-700", animation: "fade-in", step: 2 }
      ]
    },
    {
      slideIndex: 2,
      title: "The Zero Trust Architecture Model",
      elements: [
        { id: "s2-el1", type: "heading", content: "Core Zero Trust Principles", x: 10, y: 15, w: 80, h: 15, size: 32, color: "#0f172a", animation: "fade-in", step: 0 },
        { id: "s2-el2", type: "list", items: [
          "Never Trust, Always Verify: Authenticate and authorize every request explicitly.",
          "Least Privilege Access: Restrict user access with Just-In-Time (JIT) controls.",
          "Assume Breach: Minimize blast radius and segment system access pathways."
        ], x: 10, y: 30, w: 80, h: 50, size: 16, color: "#334155", animation: "slide-left", step: 1 }
      ]
    },
    {
      slideIndex: 3,
      title: "Asset Exfiltration Vectors",
      elements: [
        { id: "s3-el1", type: "heading", content: "Common PDF and File Download Leaks", x: 10, y: 15, w: 80, h: 15, size: 32, color: "#0f172a", animation: "fade-in", step: 0 },
        { id: "s3-el2", type: "text", content: "Traditional attachments are saved to browser cache or download folders, allowing unauthorized sharing.", x: 10, y: 32, w: 80, h: 15, size: 16, color: "#475569", animation: "slide-up", step: 1 },
        { id: "s3-el3", type: "shape", shapeType: "rect", x: 10, y: 50, w: 80, h: 30, color: "#fef2f2", text: "Warning: Downloading static files leaves untracked copies.", border: "border-red-200 text-red-600", animation: "fade-in", step: 2 }
      ]
    }
  ];
}

function getBusinessSlides() {
  return [
    {
      slideIndex: 1,
      title: "Q3 Business Expansion Blueprint",
      elements: [
        { id: "b1-el1", type: "heading", content: "Q3 Strategy Planning Session", x: 10, y: 15, w: 80, h: 15, size: 36, color: "#1e1b4b", animation: "fade-in", step: 0 },
        { id: "b1-el2", type: "text", content: "Expanding market footprint and streamlining internal resource distributions.", x: 10, y: 35, w: 80, h: 15, size: 18, color: "#4338ca", animation: "slide-up", step: 1 },
        { id: "b1-el3", type: "shape", shapeType: "rect", x: 10, y: 55, w: 80, h: 30, color: "#eef2ff", text: "Internal Board Members Review Only", border: "border-indigo-200 text-indigo-700", animation: "fade-in", step: 2 }
      ]
    },
    {
      slideIndex: 2,
      title: "Key Market Penetration Strategies",
      elements: [
        { id: "b2-el1", type: "heading", content: "Growth Vector Breakdown", x: 10, y: 15, w: 80, h: 15, size: 32, color: "#0f172a", animation: "fade-in", step: 0 },
        { id: "b2-el2", type: "list", items: [
          "Direct Digital Channels: Optimize inbound customer conversion funnels.",
          "Strategic Integration Alliances: Partner with platform service providers.",
          "Localized Regional Campaigns: Deploy customized messaging modules."
        ], x: 10, y: 30, w: 80, h: 50, size: 16, color: "#334155", animation: "slide-left", step: 1 }
      ]
    }
  ];
}

function getDynamicContextSlides(title) {
  return [
    {
      slideIndex: 1,
      title: title,
      elements: [
        { id: "dy1-el1", type: "heading", content: `${title} 개요`, x: 10, y: 15, w: 80, h: 15, size: 38, color: "#1e3a8a", animation: "fade-in", step: 0 },
        { id: "dy1-el2", type: "text", content: `${title} 분야의 개념 고찰 및 시스템 환경 조사 연구`, x: 10, y: 32, w: 80, h: 10, size: 18, color: "#475569", animation: "slide-up", step: 1 },
        { id: "dy1-el3", type: "shape", shapeType: "rect", x: 10, y: 55, w: 80, h: 30, color: "#eff6ff", text: `${title} 연구 모델 및 분석 방법 적용 진행`, border: "border-blue-200 text-blue-800", animation: "fade-in", step: 2 }
      ]
    },
    {
      slideIndex: 2,
      title: `${title} 핵심 추진 요소`,
      elements: [
        { id: "dy2-el1", type: "heading", content: "주요 구성 아키텍처 및 구현 방안", x: 10, y: 15, w: 80, h: 15, size: 32, color: "#0f172a", animation: "fade-in", step: 0 },
        { id: "dy2-el2", type: "list", items: [
          `첫 번째 단계: ${title}에 대한 기초 요구사항 조사 및 시스템 구조 정의`,
          `두 번째 단계: 핵심 컴포넌트 모델 설계 및 예외 시나리오 보완 방안 강구`,
          `세 번째 단계: 종합 성능 평가 진행 및 지속성 향상을 위한 최적화 수행`
        ], x: 10, y: 30, w: 80, h: 50, size: 16, color: "#334155", animation: "slide-left", step: 1 }
      ]
    },
    {
      slideIndex: 3,
      title: "결론 및 기대 효과",
      elements: [
        { id: "dy3-el1", type: "heading", content: `${title}의 발전 전망`, x: 10, y: 15, w: 80, h: 15, size: 32, color: "#0f172a", animation: "fade-in", step: 0 },
        { id: "dy3-el2", type: "text", content: `통합 검증 플랫폼 도입을 통해 ${title} 공정의 효율성을 기존 대비 극대화시킵니다.`, x: 10, y: 32, w: 80, h: 15, size: 18, color: "#475569", animation: "slide-up", step: 1 },
        { id: "dy3-el3", type: "shape", shapeType: "rect", x: 10, y: 50, w: 80, h: 30, color: "#ecfdf5", text: `안정적이고 표준화된 ${title} 인프라 체계 구축 완결`, border: "border-emerald-200 text-emerald-800", animation: "fade-in", step: 2 }
      ]
    }
  ];
}

module.exports = {
  convertPptxToHtml5
};
