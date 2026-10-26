import './journey.css';
import {defaultPortfolio,mediaURL} from './portfolio-model.js';
const ns='http://www.w3.org/2000/svg';
export const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const svg=(tag,attrs)=>{const n=document.createElementNS(ns,tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,v);return n;};
export const dateLabel=item=>`${new Date(item.date+'T00:00:00Z').toLocaleDateString('en-GB',{month:'short',year:'numeric',timeZone:'UTC'})} — ${item.end?new Date(item.end+'T00:00:00Z').toLocaleDateString('en-GB',{month:'short',year:'numeric',timeZone:'UTC'}):'Present'}`;
export const storyGallery=(item)=>{const wrap=el('div',undefined,'story-gallery');for(const id of item.media||[]){const image=el('img');image.src=mediaURL(id);image.alt=item.title;image.loading='lazy';wrap.append(image);}return wrap;};
const dialog=el('dialog',undefined,'story-dialog');dialog.setAttribute('aria-label','Journey details');document.body.append(dialog);
export function openStory(item,index=0){dialog.replaceChildren();const close=el('button','×','dialog-close');close.type='button';close.setAttribute('aria-label','Close story');close.onclick=()=>dialog.close();dialog.append(close,el('p',item.date?dateLabel(item):item.subtitle,'eyebrow'),el('h2',item.title),el('p',item.date?item.subtitle:'','story-subtitle'),el('p',item.description,'story-copy'));const tags=el('div',undefined,'tags');for(const t of item.tags||[])tags.append(el('span',t));dialog.append(tags,storyGallery(item));dialog.showModal();}
dialog.onclick=e=>{if(e.target===dialog&&!(e.clientX>=dialog.getBoundingClientRect().left&&e.clientX<=dialog.getBoundingClientRect().right&&e.clientY>=dialog.getBoundingClientRect().top&&e.clientY<=dialog.getBoundingClientRect().bottom))dialog.close();};
let observer;
export function drawJourney(items){
 const host=document.getElementById('experience-list');host.replaceChildren();host.className='journey-track';
 const ordered=items.toSorted((a,b)=>a.date.localeCompare(b.date)||a.title.localeCompare(b.title));
 if(!ordered.length){host.append(el('p','New chapters are on their way.','muted'));return;}
 const columns=3,rows=Math.ceil(ordered.length/columns),height=rows*242;host.style.setProperty('--journey-height',height+'px');
 const art=svg('svg',{viewBox:`0 0 1000 ${height}`,preserveAspectRatio:'none','aria-hidden':'true',class:'journey-road'});
 let path='M 90 115 H 910';for(let r=1;r<rows;r++){const y=115+r*242,previous=y-242;path+=r%2?` C 1010 ${previous} 1010 ${y} 910 ${y} H 90`:` C -10 ${previous} -10 ${y} 90 ${y} H 910`;}
 art.append(svg('path',{d:path,class:'road-shadow'}),svg('path',{d:path,class:'road-base'}),svg('path',{d:path,class:'road-lane'}),svg('path',{d:path,class:'road-flow'}));host.append(art);
 const first=Date.parse(ordered[0].date),last=Date.parse(ordered.at(-1).date),span=Math.max(1,last-first);
 ordered.forEach((item,i)=>{
 const row=Math.floor(i/columns),group=ordered.slice(row*columns,row*columns+columns),lo=Date.parse(group[0].date),hi=Date.parse(group.at(-1).date);
 // Date-proportional position blended with minimum spacing keeps near-identical dates legible.
 const local=i%columns,fraction=group.length===1?.5:.45*local/(group.length-1)+.55*(Date.parse(item.date)-lo)/Math.max(1,hi-lo),x=12+fraction*76,left=row%2?100-x:x;
 const point=el('div',undefined,`journey-stop${row%2?' reverse':''}`);point.style.left=`${left}%`;point.style.top=`${row*242}px`;point.style.setProperty('--chapter-hue',String(165+(Date.parse(item.date)-first)/span*95));
 const button=el('button',undefined,'journey-pin');button.type='button';button.setAttribute('aria-label',`Read ${item.title}, ${dateLabel(item)}`);button.append(el('span',String(i+1).padStart(2,'0')));button.onclick=()=>openStory(item,i);
 const caption=el('div',undefined,'journey-caption');caption.append(el('span',dateLabel(item),'journey-date'),el('h3',item.title),el('p',item.subtitle));
 const peek=el('div',undefined,'journey-peek');peek.setAttribute('aria-hidden','true');if(item.media?.length){const image=el('img');image.src=mediaURL(item.media[0]);image.alt='';image.loading='lazy';peek.append(image);}peek.append(el('strong',item.title),el('p',item.description.slice(0,180)),el('span','Open chapter ↗','mono'));
 point.append(button,caption,peek);host.append(point);
 });
 observer?.disconnect();if('IntersectionObserver'in window){observer=new IntersectionObserver(([e])=>host.classList.toggle('journey-playing',e.isIntersecting));observer.observe(host);}else host.classList.add('journey-playing');
}
let audio,trackId;
export function renderPortfolio(value){
 const p=value.profile;
 const h=document.querySelector('.hero h1');h.replaceChildren(el('span',p.name+'.'),el('br'),el('span',p.headline,'gradient'));
 document.querySelector('.hero-summary').textContent=p.summary;
 document.querySelector('.hero .eyebrow').textContent=`${p.name.toUpperCase()} / PERSONAL PORTFOLIO`;
 const about=document.querySelector('#about>div:last-child'),paragraphs=about.querySelectorAll(':scope>p:not(.eyebrow)');paragraphs[0].textContent=p.about;paragraphs[0].style.whiteSpace='pre-line';paragraphs[1]?.remove();
 document.querySelector('.portrait-frame img').hidden=!p.portrait;if(p.portrait)document.querySelector('.portrait-frame img').src=mediaURL(p.portrait);document.querySelector('.portrait-frame img').alt=p.name;document.querySelector('.portrait-caption .mono').textContent=p.name.toUpperCase();
 const links=document.querySelector('.contact-links');links.replaceChildren();for(const [text,url]of [[p.email,`mailto:${p.email}`],[p.phone,`tel:${p.phone}`]]){const a=el('a',text+' ↗');a.href=url;links.append(a);}
 const skills=document.querySelector('.expertise-grid');skills.replaceChildren();value.skills.forEach((s,i)=>{const card=el('article',undefined,'expertise-card skill-card');card.append(el('span',String(i+1).padStart(2,'0'),'skill-number'),el('span',s.subtitle,'mono muted'),el('h3',s.title),el('p',s.description));const tags=el('div',undefined,'tags');s.tags.forEach(t=>tags.append(el('span',t)));card.append(tags);if(s.media.length){const more=el('button','Explore skill ↗','text-button');more.onclick=()=>openStory(s);card.append(more);}skills.append(card);});document.getElementById('expertise').hidden=!value.skills.length;
 drawJourney(value.journey);
 const education=document.querySelector('.education-grid');education.replaceChildren(...value.education.map(e=>{const card=el('article');card.append(el('span',e.subtitle,'mono muted'),el('h3',e.title),el('p',e.description));if(e.media.length){const more=el('button','Explore chapter ↗','text-button');more.type='button';more.onclick=()=>openStory(e);card.append(more);}return card;}));
 for(const group of ['activities','family']){const section=document.getElementById(`personal-${group}`);section.hidden=!value[group].length;const grid=section.querySelector('.personal-grid');grid.replaceChildren(...value[group].map((item,i)=>{const button=el('button',undefined,'personal-card');button.type='button';if(item.media.length){const img=el('img');img.src=mediaURL(item.media[0]);img.alt=item.title;img.loading='lazy';button.append(img);}else button.append(el('span',group==='family'?'♡':'↗','personal-art'));const copy=el('div');copy.append(el('span',item.subtitle,'eyebrow'),el('h3',item.title),el('p',item.description.slice(0,180)),el('span','View story ↗','text-link'));button.append(copy);button.onclick=()=>openStory(item,i);return button;}));}
 const year=el('span',String(new Date().getFullYear()));year.id='year';document.querySelector('.site-footer>.mono').replaceChildren(document.createTextNode('© '),year,document.createTextNode(' '+p.name.toUpperCase()));
 const music=document.getElementById('portfolio-music');music.hidden=!p.music;if(trackId!==p.music){audio?.pause();audio=undefined;trackId=p.music;music.textContent='♫ Play soundtrack';music.setAttribute('aria-pressed','false');}music.title=p.musicTitle;music.onclick=async()=>{if(!audio){audio=new Audio(mediaURL(p.music));audio.preload='none';audio.loop=true;audio.volume=.25;audio.onerror=()=>{music.textContent='♫ Track unavailable';music.setAttribute('aria-pressed','false');};}if(audio.paused){try{await audio.play();music.textContent='Ⅱ Pause music';music.setAttribute('aria-pressed','true');}catch{music.textContent='♫ Tap to try again';}}else{audio.pause();music.textContent='♫ Play soundtrack';music.setAttribute('aria-pressed','false');}};
}
export function initPortfolio(onContent){renderPortfolio(defaultPortfolio);fetch('/api/portfolio/content/').then(r=>{if(!r.ok)throw Error();return r.json();}).then(v=>{renderPortfolio(v);onContent(v);}).catch(()=>{});}
