// Layout supports OFL brush-font outlines and the earlier public-domain stroke format.
export function decodeStrokes(data) {
  return data.trim().split(/(?=M)/i).filter(Boolean).map(stroke => {
    const numbers = stroke.match(/-?\d+(?:\.\d+)?/g)?.map(Number) || [];
    const points = [];
    for (let i = 0; i < numbers.length - 1; i += 2) points.push({x:numbers[i], y:numbers[i + 1]});
    return points;
  }).filter(points => points.length > 1);
}

export function smoothStroke(points) {
  const point = p => `${p.x.toFixed(3)},${p.y.toFixed(3)}`;
  let path = `M${point(points[0])}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)], p1 = points[i];
    const p2 = points[i + 1], p3 = points[Math.min(points.length - 1, i + 2)];
    const a = {x:p1.x + (p2.x - p0.x) / 6, y:p1.y + (p2.y - p0.y) / 6};
    const b = {x:p2.x - (p3.x - p1.x) / 6, y:p2.y - (p3.y - p1.y) / 6};
    path += ` C${point(a)} ${point(b)} ${point(p2)}`;
  }
  return path;
}

function accents(mark, center, top) {
  const marks = {
    '\u0301':[[{x:center-2,y:top},{x:center+2,y:top-3}]],
    '\u0300':[[{x:center+2,y:top},{x:center-2,y:top-3}]],
    '\u0302':[[{x:center-3,y:top},{x:center,y:top-3},{x:center+3,y:top}]],
    '\u0303':[[{x:center-4,y:top},{x:center-2,y:top-2},{x:center+1,y:top},{x:center+4,y:top-2}]],
    '\u0308':[[{x:center-3,y:top},{x:center-2.7,y:top+.3}],[{x:center+3,y:top},{x:center+3.3,y:top+.3}]],
    '\u0304':[[{x:center-4,y:top},{x:center+4,y:top}]],
    '\u030a':[[{x:center-2,y:top-1},{x:center,y:top-3},{x:center+2,y:top-1},{x:center,y:top+1},{x:center-2,y:top-1}]],
    '\u030c':[[{x:center-3,y:top-3},{x:center,y:top},{x:center+3,y:top-3}]],
    '\u0327':[[{x:center,y:25},{x:center+2,y:27},{x:center,y:29},{x:center-2,y:28}]],
  };
  return marks[mark] || null;
}

export function layoutSignature(name, font, canvasWidth=720) {
  if (font.glyphs) return layoutBrushSignature(name,font,canvasWidth);
  return layoutPenSignature(name,font,canvasWidth);
}

function layoutPenSignature(name,font,canvasWidth) {
  const originalName = String(name).trim();
  const clusters = typeof Intl.Segmenter === 'function'
    ? [...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(originalName)].map(part => part.segment)
    : Array.from(originalName);
  let cursor = 0;
  const strokes = [];
  let supported = true;
  for (const original of clusters) {
    if (/^\s+$/u.test(original)) { cursor += 12; continue; }
    const normal = original.normalize('NFD').replace(/[’‘]/g,"'").replace(/[‐‑–—]/g,'-');
    const letters = Array.from(normal);
    const base = letters[0];
    const glyph = base && base.codePointAt(0) >= 33 && base.codePointAt(0) <= 126 ? font.chars[base.codePointAt(0)-33] : null;
    if (!glyph?.d) { supported = false; break; }
    let glyphStrokes = decodeStrokes(glyph.d);
    if (base === 'i' && letters.length > 1) glyphStrokes = glyphStrokes.slice(1);
    else if (base === 'i' || base === 'j') glyphStrokes = [...glyphStrokes.slice(1),glyphStrokes[0]];
    strokes.push(...glyphStrokes.map(points => points.map(p => ({x:p.x+cursor,y:p.y}))));
    for (const accent of letters.slice(1)) {
      const extra = accents(accent, glyph.o * .8, /[a-z]/.test(base) ? 8 : -1);
      if (!extra) { supported=false; break; }
      strokes.push(...extra.map(points => points.map(p => ({x:p.x+cursor,y:p.y}))));
    }
    if (!supported) break;
    const exit=decodeStrokes(glyph.d).at(-1)?.at(-1);
    cursor += /[a-z]/.test(base) && exit?.y === 17 ? Math.max(glyph.o*1.2,exit.x) : glyph.o*1.6;
  }
  const height=460,angle=-5,theta=angle*Math.PI/180;
  if (!supported || !strokes.length) return {name:originalName,supported:false,width:canvasWidth,height,angle,paths:[]};
  const transform=p=>{
    const x=p.x+.32*(22-p.y);
    return {x:x*Math.cos(theta)-p.y*Math.sin(theta),y:x*Math.sin(theta)+p.y*Math.cos(theta)};
  };
  const transformed=strokes.map(points=>points.map(transform));
  const all=transformed.flat(),left=Math.min(...all.map(p=>p.x)),right=Math.max(...all.map(p=>p.x));
  const top=Math.min(...all.map(p=>p.y)),bottom=Math.max(...all.map(p=>p.y));
  const scale=Math.min(3.8,(canvasWidth-64)/Math.max(1,right-left),(height-40)/Math.max(1,bottom-top));
  const paths=transformed.map(points=>smoothStroke(points.map(p=>({x:(canvasWidth-(right-left)*scale)/2+(p.x-left)*scale,y:(height-(bottom-top)*scale)/2+(p.y-top)*scale}))));
  return {name:originalName,supported:true,width:canvasWidth,height,angle,scale,paths};
}

function transformOutline(path,transform) {
  const tokens=path.match(/[MLCQZ]|[-+]?(?:\d*\.?\d+)(?:e[-+]?\d+)?/gi)||[];
  const output=[];
  for(let i=0;i<tokens.length;) {
    if(/^[MLCQZ]$/i.test(tokens[i])) {output.push(tokens[i++]);continue;}
    const point=transform({x:Number(tokens[i++]),y:Number(tokens[i++])});
    output.push(`${point.x.toFixed(3)},${point.y.toFixed(3)}`);
  }
  return output.join(' ');
}

function layoutBrushSignature(name,font,width) {
  const originalName=String(name).trim();
  const clusters=typeof Intl.Segmenter==='function'?[...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(originalName)].map(p=>p.segment):Array.from(originalName);
  const height=460,angle=-5,theta=angle*Math.PI/180;
  const rotate=p=>({x:p.x*Math.cos(theta)-p.y*Math.sin(theta),y:p.x*Math.sin(theta)+p.y*Math.cos(theta)});
  const letters=[];let cursor=0,previous='';
  for(const cluster of clusters) {
    if(/^\s+$/u.test(cluster)){cursor+=font.space;previous='';continue;}
    let char=cluster.normalize('NFC');
    if(!font.glyphs[char])char=char.replace(/[’‘]/g,"'").replace(/[‐‑–—]/g,'-');
    const glyph=font.glyphs[char];
    if(!glyph?.d || !glyph.strokes?.length)return{name:originalName,supported:false,width,height,angle,paths:[]};
    cursor+=font.kern[previous+char]||0;
    letters.push({glyph,offset:cursor});cursor+=glyph.width;previous=char;
  }
  if(!letters.length)return{name:originalName,supported:false,width,height,angle,paths:[]};
  const corners=letters.flatMap(({glyph,offset})=>{
    const [left,top,right,bottom]=glyph.bounds;
    return [{x:left+offset,y:top},{x:right+offset,y:top},{x:left+offset,y:bottom},{x:right+offset,y:bottom}].map(rotate);
  });
  const left=Math.min(...corners.map(p=>p.x)),right=Math.max(...corners.map(p=>p.x));
  const top=Math.min(...corners.map(p=>p.y)),bottom=Math.max(...corners.map(p=>p.y));
  const scale=Math.min(.849,(width-56)/Math.max(1,right-left),(height-56)/Math.max(1,bottom-top));
  const fit=p=>({x:(width-(right-left)*scale)/2+(p.x-left)*scale,y:(height-(bottom-top)*scale)/2+(p.y-top)*scale});
  const paths=[];
  const glyphs=letters.map(({glyph,offset})=>{
    const transform=p=>fit(rotate({x:p.x+offset,y:p.y}));
    const indexes=[];
    glyph.strokes.forEach(points=>{
      indexes.push(paths.length);
      paths.push(smoothStroke(points.map(([x,y])=>transform({x,y}))));
    });
    return{d:transformOutline(glyph.d,transform),strokeIndexes:indexes,maskWidth:glyph.maskWidth*scale};
  });
  return{name:originalName,supported:true,width,height,angle,scale,paths,glyphs};
}
