import {layoutSignature} from './signature-layout.mjs?v=866a2a9f44ea';

const NS = 'http://www.w3.org/2000/svg';
let fontPromise;
const strokeFont = () => fontPromise ||= fetch(new URL('./assets/signature-handwriting.json?v=b8b7036f5214',import.meta.url)).then(response => {
  if (!response.ok) throw new Error('Signature font could not load.');
  return response.json();
}).catch(error => {fontPromise=null;throw error;});
const wait = ms => new Promise(resolve => setTimeout(resolve,ms));
const svgNode = name => document.createElementNS(NS,name);
const mix = (a,b,t) => a+(b-a)*t;

export function createSignatureAnimation({svg,stage,penLayer,penImage,status}) {
  if ('requestIdleCallback' in window) window.requestIdleCallback(()=>strokeFont().catch(()=>{}),{timeout:2000});
  let isRunning = false;
  let abort = null;
  const nib = {x:.122,y:.916};
  let nibWidth = 160, nibHeight = 240;
  function penAt(point,angle=0) {
    penImage.style.transform=`translate3d(${point.x-nibWidth*nib.x}px,${point.y-nibHeight*nib.y}px,0) rotate(${angle}deg)`;
  }
  function screenPoint(path,length) {
    const p=path.getPointAtLength(length), matrix=svg.getScreenCTM();
    return matrix ? new DOMPoint(p.x,p.y).matrixTransform(matrix) : {x:p.x,y:p.y};
  }
  function frame(duration,update,signal) {
    return new Promise((resolve,reject) => {
      let previous,elapsed=0;
      const tick = now => {
        if (signal.aborted) {reject(new DOMException('Animation cancelled.','AbortError'));return;}
        if (previous!==undefined && !document.hidden) elapsed+=Math.min(32,Math.max(0,now-previous));
        previous=now;
        const t = Math.min(1,elapsed/duration);
        update(t);
        if (t<1) requestAnimationFrame(tick); else resolve();
      };
      requestAnimationFrame(tick);
    });
  }
  async function loadImage() {
    if (penImage.complete && penImage.naturalWidth) return;
    await Promise.race([
      new Promise((resolve,reject) => {
        penImage.addEventListener('load',resolve,{once:true});
        penImage.addEventListener('error',() => reject(new Error('Pen image could not load.')),{once:true});
      }),
      wait(8000).then(() => {if (!penImage.naturalWidth) throw new Error('Pen image could not load.');})
    ]);
  }
  function setupSvg(name) {
    svg.replaceChildren();
    svg.style.height='';
    svg.setAttribute('viewBox','0 0 720 460');
    svg.setAttribute('aria-label',`Signature: ${name}`);
    const title=svgNode('title');title.textContent=name;svg.append(title);
  }
  function fitSignatureViewport() {
    // Crop unused canvas space while preserving the previous lettering scale.
    const bounds=svg.getBBox();
    if (!bounds.height || !bounds.width) return;
    const scale=Math.min(svg.getBoundingClientRect().width/720,200/460);
    const padding=10;
    const height=bounds.height+padding*2;
    svg.setAttribute('viewBox',`0 ${bounds.y-padding} 720 ${height}`);
    svg.style.height=`${height*scale}px`;
  }
  async function flyIn(target,signal) {
    const start={x:window.innerWidth+nibWidth,y:target.y-80};
    await frame(280,t => {const p=1-(1-t)**3;penAt({x:mix(start.x,target.x,p),y:mix(start.y,target.y,p)},mix(-14,0,p));},signal);
  }
  async function flyOut(start,signal) {
    await wait(60);
    await frame(280,t => {const p=t*t;penAt({x:mix(start.x,window.innerWidth+nibWidth,p),y:mix(start.y,start.y-90,p)},mix(0,-12,p));},signal);
  }
  return {
    get running(){return isRunning;},
    clear(){if (!isRunning) {stage.hidden=true;svg.replaceChildren();status.textContent='';}},
    cancel(){abort?.abort();},
    async play(name) {
      if (isRunning) return false;
      isRunning=true;abort=new AbortController();
      const signal=abort.signal;
      stage.hidden=false;stage.setAttribute('aria-busy','true');
      status.textContent='Preparing your signature…';
      stage.scrollIntoView({behavior:'auto',block:'center'});
      const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      try {
        const [font] = await Promise.all([strokeFont(),reduced?Promise.resolve():loadImage()]);
        const layout=layoutSignature(name,font);
        setupSvg(name);
        nibWidth=Math.min(180,Math.max(125,window.innerWidth*.16));nibHeight=nibWidth*1.5;
        penImage.style.width=`${nibWidth}px`;penImage.style.height=`${nibHeight}px`;
        if (!reduced) {penLayer.hidden=false;penAt({x:window.innerWidth+nibWidth,y:0});}
        status.textContent='Writing your signature…';
        if (!layout.supported) {
          status.textContent='Please use Latin letters for this handwritten signature.';
          return false;
        } else {
          let paths=[];
          const makeStroke=(d,parent,className,width) => {
            const p=svgNode('path');p.setAttribute('d',d);p.setAttribute('class',className);
            if(width)p.setAttribute('stroke-width',String(width));parent.append(p);
            const length=Math.max(.01,p.getTotalLength());p.style.strokeDasharray=`${length} ${length}`;p.style.strokeDashoffset=String(length);
            return {path:p,length};
          };
          paths=layout.paths.map(d=>makeStroke(d,svg,'signature-ink'));
          fitSignatureViewport();
          if (reduced) {
            paths.forEach(p => p.path.style.strokeDashoffset='0');
          } else {
            await flyIn(screenPoint(paths[0].path,0),signal);
            const timeline=[];let weight=0;
            paths.forEach((item,index) => {
              if(index) {
                const previous=paths[index-1], a=previous.path.getPointAtLength(previous.length), b=item.path.getPointAtLength(0);
                const gap=Math.max(4,Math.hypot(a.x-b.x,a.y-b.y)*.22);
                timeline.push({type:'lift',a,b,start:weight,weight:gap});weight+=gap;
              }
              timeline.push({type:'ink',...item,start:weight,weight:item.length});weight+=item.length;
            });
            let current=0;
            await frame(Math.min(4800,Math.max(2600,weight*1.45)),t => {
              const position=t*weight;
              while(current<timeline.length-1 && position>timeline[current].start+timeline[current].weight) {
                if(timeline[current].type==='ink') timeline[current].path.style.strokeDashoffset='0';
                current++;
              }
              const item=timeline[current], fraction=Math.min(1,Math.max(0,(position-item.start)/item.weight));
              if(item.type==='ink') {
                item.path.style.strokeDashoffset=String(item.length*(1-fraction));
                penAt(screenPoint(item.path,item.length*fraction),Math.sin(position*.032)*1.8);
              } else {
                const p=new DOMPoint(mix(item.a.x,item.b.x,fraction),mix(item.a.y,item.b.y,fraction)-Math.sin(Math.PI*fraction)*4).matrixTransform(svg.getScreenCTM());
                penAt(p,-3*Math.sin(Math.PI*fraction));
              }
            },signal);
            const end=paths.at(-1);
            await flyOut(screenPoint(end.path,end.length),signal);
          }
        }
        status.textContent='Signature complete.';
        await wait(1000);
        if (signal.aborted) throw new DOMException('Animation cancelled.','AbortError');
        return true;
      } catch(error) {
        if(error.name==='AbortError') throw error;
        // Never replace a partially written name with completed text or advance to Payment.
        status.textContent='We couldn’t finish the signature. Please try again.';
        return false;
      } finally {
        penLayer.hidden=true;stage.setAttribute('aria-busy','false');isRunning=false;abort=null;
      }
    }
  };
}
