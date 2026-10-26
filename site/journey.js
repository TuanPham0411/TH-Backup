import {portraitVideo} from './portrait-video.js';
import {setPhotoDescriptions,describePhoto} from './photo-description.js';
import {setTitleStyles,styledTitle,applyPageTitles} from './title-style.js';
import {timelineEntries,routePoint,routeAt,dateSlot,rangePath} from './journey-layout.js';
import {setMediaTypes,mediaElement,mediaType,stopMedia} from './portfolio-media.js';
import {applyCopy} from './page-copy.js';
import './journey.css';
import {defaultPortfolio,mediaURL,normalizePortfolio} from './portfolio-model.js';
const ns='http://www.w3.org/2000/svg';
export const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const svg=(tag,attrs)=>{const n=document.createElementNS(ns,tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,v);return n;};
export const dateLabel=item=>{const format=value=>item.datePrecision==='year'?value.slice(0,4):new Date(value+'T00:00:00Z').toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'});return item.date?format(item.date)+(item.end?' — '+format(item.end):item.kind==='milestone'?'':' — Present'):item.subtitle;};
const itemKey=item=>`item-${item.sourceGroup||item.group||'journey'}-${item.id}`;

export const storyGallery=(item)=>{const wrap=el('div',undefined,'story-gallery');for(const id of item.media||[])wrap.append(mediaElement(id,item.title));return wrap;};
const dialog=el('dialog',undefined,'story-dialog');dialog.setAttribute('aria-label','Journey details');document.body.append(dialog);
dialog.addEventListener('close',()=>stopMedia(dialog));
export function openStory(item,index=0){
 stopMedia(dialog);dialog.replaceChildren();const close=el('button','×','dialog-close');close.type='button';close.setAttribute('aria-label','Close story');close.onclick=()=>dialog.close();
 const heading=el('header',undefined,'story-heading');heading.append(el('span',item.kind==='education'?'EDUCATION / LEARNING':'MY JOURNEY / CHAPTER','story-kicker'),styledTitle(el('h2',item.title),itemKey(item)),el('p',dateLabel(item),'story-date'),el('p',item.subtitle,'story-subtitle'));
 dialog.append(close,heading,el('p',item.description,'story-copy'));if(item.public===false)heading.prepend(el('span','🔒 Riêng tư · chỉ admin xem được','private-badge'));const tags=el('div',undefined,'tags');for(const t of item.tags||[])tags.append(el('span',t));dialog.append(tags,storyGallery(item));dialog.showModal();
}

dialog.onclick=e=>{if(e.target===dialog&&!(e.clientX>=dialog.getBoundingClientRect().left&&e.clientX<=dialog.getBoundingClientRect().right&&e.clientY>=dialog.getBoundingClientRect().top&&e.clientY<=dialog.getBoundingClientRect().bottom))dialog.close();};
let observer;
export function drawJourney(items){
 const host=document.getElementById('experience-list');host.replaceChildren();host.className='journey-track';
 const ordered=items.toSorted((a,b)=>a.date.localeCompare(b.date)||a.title.localeCompare(b.title));
 host.hidden=!ordered.length;if(!ordered.length){host.append(el('p','New chapters are on their way.','muted'));return;}
 const rows=Math.ceil((ordered.length+1)/3),height=rows*260;host.style.setProperty('--journey-height',height+'px');
 const backdrop=svg('svg',{viewBox:`0 0 1000 ${height}`,preserveAspectRatio:'none','aria-hidden':'true',class:'journey-signal'});
 for(let i=0;i<5;i++){const y=40+i*height/5;backdrop.append(svg('path',{d:`M -20 ${y} H 170 l 35 -18 h 100 l 40 35 h 100 l 35 -35 h 100 l 30 18 H 1020`,class:'signal-branch',style:`animation-delay:${-i*2}s`}));}host.append(backdrop);
 const art=svg('svg',{viewBox:`0 0 1000 ${height}`,preserveAspectRatio:'none','aria-hidden':'true',class:'journey-road'});let path='';
 for(let i=0;i<=ordered.length;i++){const p=routePoint(i);if(!i){path=`M ${p.x} ${p.y}`;continue;}const previous=routePoint(i-1);path+=p.y===previous.y?` H ${p.x}`:` C ${p.x+(p.x>500?140:-140)} ${previous.y} ${p.x+(p.x>500?140:-140)} ${p.y} ${p.x} ${p.y}`;}
 art.append(svg('path',{d:path,class:'road-shadow'}),svg('path',{d:path,class:'road-base'}),svg('path',{d:path,class:'road-lane'}),svg('path',{d:path,class:'road-flow'}));host.append(art);
 const laneEnds=[];for(let i=0;i<ordered.length;i++){
 const item=ordered[i];if(item.kind==='milestone')continue;
 const start=Date.parse(item.date),end=item.end?Date.parse(item.end):Date.now();
 let lane=laneEnds.findIndex(value=>value<=start);if(lane<0)lane=laneEnds.length;laneEnds[lane]=end;
 const finish=Math.max(i+.04,dateSlot(ordered,end)),offset=8+lane*5;
 const color=item.kind==='education'?'#b8a1ff':`hsl(${165+i/Math.max(1,ordered.length-1)*75} 65% 65%)`;
 const band=svg('path',{d:rangePath(i,finish,lane),class:`journey-duration ${item.kind==='education'?'education-duration':'work-duration'}${item.end?'':' ongoing-duration'}`,style:`stroke:${color}`});
 const title=svg('title',{});title.textContent=`${item.title}: ${dateLabel(item)}`;band.append(title);art.append(band);
 for(const [slot,isEnd]of [[i,false],[finish,true]]){
 const p=routeAt(slot),cap=svg('circle',{cx:p.x,cy:p.y+offset,r:isEnd?4:3,class:`journey-range-cap${isEnd?' range-end':' range-start'}`,style:`stroke:${color};fill:${isEnd?'#0b1925':color}`});
 const label=svg('title',{});label.textContent=`${item.title} · ${isEnd?(item.end?'End: '+item.end:'Ongoing · Present'):'Start: '+item.date}`;cap.append(label);art.append(cap);
 }
 }

 const end=routePoint(ordered.length);art.append(svg('circle',{cx:end.x,cy:end.y,r:5,class:'journey-now'}));
 const first=Date.parse(ordered[0].date),last=Date.parse(ordered.at(-1).date),span=Math.max(1,last-first);
 ordered.forEach((item,i)=>{
 const {x,y}=routePoint(i),row=Math.floor(i/3),left=x/10;
 const point=el('div',undefined,`journey-stop${row%2?' reverse':''}${item.kind==='education'?' education-stop':''}`);if(item.public===false){point.classList.add('private-entry');point.setAttribute('data-visibility','Riêng tư');}point.style.left=`${left}%`;point.style.top=`${y-21}px`;point.style.setProperty('--chapter-hue',item.kind==='education'?'270':String(165+(Date.parse(item.date)-first)/span*75));
 const button=el('button',undefined,'journey-pin');button.type='button';button.setAttribute('aria-label',`Read ${item.title}, ${dateLabel(item)}`);button.append(el('span',item.kind==='education'?'🎓':String(i+1).padStart(2,'0')));button.onclick=()=>openStory(item,i);
 const caption=el('div',undefined,'journey-caption');caption.append(el('span',dateLabel(item),'journey-date'),styledTitle(el('h3',item.title),itemKey(item)),el('p',item.subtitle));
 const peek=el('div',undefined,'journey-peek');peek.setAttribute('aria-label',item.title+' preview');peek.append(styledTitle(el('h3',item.title),itemKey(item)),el('p',dateLabel(item),'story-date'),el('p',item.description.slice(0,320),'peek-description'));
 if(item.media?.length){const reel=el('div',undefined,'journey-peek-media');for(const id of item.media)reel.append(mediaElement(id,item.title,{preview:true}));peek.append(reel);if(item.media.length>1){const controls=el('div',undefined,'peek-controls');const previous=el('button','←','text-button'),next=el('button','→','text-button');previous.type=next.type='button';previous.setAttribute('aria-label','Previous media');next.setAttribute('aria-label','Next media');previous.onclick=()=>{stopMedia(reel);reel.scrollBy({left:-reel.clientWidth,behavior:'smooth'});};next.onclick=()=>{stopMedia(reel);reel.scrollBy({left:reel.clientWidth,behavior:'smooth'});};controls.append(previous,el('span',`${item.media.length} photos / GIF / videos`),next);peek.append(controls);}}
 const read=el('button','Open chapter ↗','text-button');read.type='button';read.onclick=()=>openStory(item);peek.append(read);
 const positionPeek=()=>{const anchor=button.getBoundingClientRect(),box=point.getBoundingClientRect(),height=Math.min(peek.offsetHeight,innerHeight-24),width=340;peek.style.left=`${Math.max(8,Math.min(innerWidth-width-8,anchor.left+anchor.width/2-width/2))-box.left+width/2}px`;if(anchor.top>height+20){peek.style.top='auto';peek.style.bottom=`${box.bottom-anchor.top+12}px`;}else{peek.style.bottom='auto';peek.style.top=`${anchor.bottom-box.top+12}px`;}};point.addEventListener('focusin',positionPeek);point.addEventListener('pointerenter',()=>{positionPeek();const first=peek.querySelector('.journey-peek-media')?.firstElementChild,video=first?.tagName==='VIDEO'?first:null;if(video&&!matchMedia('(prefers-reduced-motion: reduce)').matches)video.play().catch(()=>{});});point.addEventListener('pointerleave',()=>stopMedia(peek));
 point.addEventListener('focusout',()=>{if(!point.contains(document.activeElement))stopMedia(peek);});
 point.append(button,caption,peek);host.append(point);
 });
 observer?.disconnect();if('IntersectionObserver'in window){observer=new IntersectionObserver(([e])=>host.classList.toggle('journey-playing',e.isIntersecting));observer.observe(host);}else host.classList.add('journey-playing');
}
let audio,trackId,currentView=normalizePortfolio(defaultPortfolio);
export const getPortfolioView=()=>currentView;
export function renderPortfolio(input){
 const value=normalizePortfolio(input),p=value.profile;currentView=value;setMediaTypes(value.mediaTypes);setPhotoDescriptions(value.mediaDescriptions,value.mediaTypes);setTitleStyles(value.titleStyles);
 const h=document.querySelector('.hero h1');h.replaceChildren(styledTitle(el('span',p.name),'profile-name'),el('br'),styledTitle(el('span',p.headline,'gradient'),'profile-headline'));
 document.querySelector('.hero-summary').textContent=p.summary;
 document.querySelector('.hero .eyebrow').textContent=`${p.name.toUpperCase()} / ${p.identityLine}`;
 const about=document.querySelector('#about>div:last-child'),paragraphs=about.querySelectorAll(':scope>p:not(.eyebrow)');paragraphs[0].textContent=p.about;paragraphs[0].style.whiteSpace='pre-line';paragraphs[1]?.remove();
 document.querySelector('.portrait-frame img').hidden=!p.portrait;if(p.portrait)document.querySelector('.portrait-frame img').src=mediaURL(p.portrait);document.querySelector('.portrait-frame img').alt=p.name;document.querySelector('.portrait-caption .mono').textContent=p.name.toUpperCase();const portraitImage=document.querySelector('.portrait-frame img');if(portraitImage.dataset.mediaId!==p.portrait)describePhoto(portraitImage,p.portrait);portraitVideo(p);
 const links=document.querySelector('.contact-links');links.replaceChildren();for(const [text,url]of [[p.email,`mailto:${p.email}`],[p.phone,`tel:${p.phone}`]].filter(([text])=>text)){const a=el('a',text+' ↗');a.href=url;links.append(a);}
 const skills=document.querySelector('.expertise-grid');skills.replaceChildren();value.skills.forEach((s,i)=>{const card=el('article',undefined,'expertise-card skill-card');if(s.public===false)card.append(el('span','🔒 Riêng tư','private-badge'));card.append(el('span',String(i+1).padStart(2,'0'),'skill-number'),el('span',s.subtitle,'mono muted'),styledTitle(el('h3',s.title),`item-skills-${s.id}`),el('p',s.description));if(s.media.length){const more=el('button','Explore skill ↗','text-button');more.onclick=()=>openStory({...s,group:'skills'});card.append(more);}skills.append(card);});document.getElementById('expertise').hidden=!(value.skills.length||value.toolkit.length);
 let toolkit=document.getElementById('skill-toolkit');if(!toolkit){toolkit=el('div',undefined,'skill-toolkit');toolkit.id='skill-toolkit';skills.before(toolkit);}toolkit.replaceChildren();for(const item of value.toolkit){const badge=styledTitle(el('button',item.title,'toolkit-badge'),`item-toolkit-${item.id}`);badge.type='button';badge.onclick=()=>openStory({...item,group:'toolkit'});if(item.public===false)badge.classList.add('private-entry');toolkit.append(badge);}
 const entries=timelineEntries(value);drawJourney(entries);document.getElementById('experience').hidden=!entries.length;
 const education=document.querySelector('.education-grid');education.replaceChildren();education.hidden=true;

 for(const group of ['activities','hobbies','family','notes']){const section=document.getElementById(`personal-${group}`);section.hidden=!value[group].length;const grid=section.querySelector('.personal-grid');grid.replaceChildren(...value[group].map((item,i)=>{const button=el('button',undefined,'personal-card');button.type='button';if(item.public===false)button.append(el('span','🔒 Riêng tư','private-badge'));if(item.media.length){if(mediaType(item.media[0]).startsWith('video/'))button.append(el('span','▶ Video story','personal-art video-cover'));else button.append(mediaElement(item.media[0],item.title));}else button.append(el('span',group==='family'?'♡':'↗','personal-art'));const copy=el('div');copy.append(el('span',item.subtitle,'eyebrow'),styledTitle(el('h3',item.title),`item-${group}-${item.id}`),el('p',item.description.slice(0,180)),el('span','View story ↗','text-link'));button.append(copy);button.onclick=()=>openStory({...item,group},i);return button;}));}
 const year=el('span',String(new Date().getFullYear()));year.id='year';document.querySelector('.site-footer>.mono').replaceChildren(document.createTextNode('© '),year,document.createTextNode(' '+p.name.toUpperCase()));
 const intro=document.getElementById('personal-intro'),player=document.getElementById('intro-player');intro.hidden=true;stopMedia(player);player.replaceChildren();
 const hero=document.querySelector('.hero-image');hero.style.backgroundImage=p.heroImage?`url("${mediaURL(p.heroImage)}")`:'none';
 const music=document.getElementById('portfolio-music');music.hidden=false;music.disabled=!p.music;if(trackId!==p.music){audio?.pause();audio=undefined;trackId=p.music;music.textContent='♫ Play soundtrack';music.setAttribute('aria-pressed','false');}if(!p.music)music.textContent='♫ Soundtrack';music.title=p.music?p.musicTitle:'No soundtrack uploaded yet';music.onclick=async()=>{if(!audio){audio=new Audio(mediaURL(p.music));audio.preload='none';audio.loop=true;audio.volume=.25;audio.onerror=()=>{music.textContent='♫ Track unavailable';music.setAttribute('aria-pressed','false');};}if(audio.paused){try{await audio.play();music.textContent='Ⅱ Pause music';music.setAttribute('aria-pressed','true');}catch{music.textContent='♫ Tap to try again';}}else{audio.pause();music.textContent='♫ Play soundtrack';music.setAttribute('aria-pressed','false');}};applyCopy(value.copy);applyPageTitles();document.dispatchEvent(new CustomEvent('portfolio:content',{detail:value}));
}
export function initPortfolio(onContent){renderPortfolio(defaultPortfolio);fetch('/api/portfolio/content/').then(r=>{if(!r.ok)throw Error();return r.json();}).then(v=>{renderPortfolio(v);onContent(v);}).catch(()=>{});}

document.addEventListener('visibilitychange',()=>{document.getElementById('experience-list').dataset.paused=String(document.hidden);if(document.hidden)document.querySelectorAll('.journey-peek video').forEach(v=>v.pause());});
