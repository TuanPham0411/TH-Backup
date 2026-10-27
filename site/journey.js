import {isTouchInterface} from './input-mode.js';
import {updatePortrait} from './portrait-image.js';
import {mediaRail,disposeMediaRails} from './media-rail.js';
import {initPersonalMotion} from './personal-motion.js';
import {eventLines} from './timeline-events.js';
import {initAboutMatrix} from './about-matrix.js';
import {portraitVideo} from './portrait-video.js';
import {setPhotoDescriptions,describePhoto} from './photo-description.js';
import {setTitleStyles,styledTitle,applyPageTitles} from './title-style.js';
import {timelineEntries} from './journey-layout.js';
import {renderDatedRoute} from './route-view.js';
import {storyCarousel,closeImageZoom} from './story-carousel.js';
import {setMediaTypes,mediaElement,mediaType,stopMedia} from './portfolio-media.js';
import {applyCopy} from './page-copy.js';
import './journey.css';
import './dated-journey.css';
import './compact-cinema.css';
import './touch-portfolio.css';
import {defaultPortfolio,mediaURL,normalizePortfolio} from './portfolio-model.js';
const ns='http://www.w3.org/2000/svg';
export const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const svg=(tag,attrs)=>{const n=document.createElementNS(ns,tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,v);return n;};
export const dateLabel=item=>{const format=value=>item.datePrecision==='year'?value.slice(0,4):new Date(value+'T00:00:00Z').toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'});return item.date?format(item.date)+(item.end&&item.end!==item.date?' — '+format(item.end):item.end||item.kind==='milestone'?'':' — Present'):item.subtitle;};
const itemKey=item=>`item-${item.sourceGroup||item.group||'journey'}-${item.id}`;

export const storyGallery=item=>storyCarousel(item.media||[],item.title,{descriptions:currentView.mediaDescriptions,layoutPreferences:currentView.timelineLayout,canEdit:currentView.adminView===true,onSaveLayout:saveTimelineLayout});
const dialog=el('dialog',undefined,'story-dialog');dialog.setAttribute('aria-label','Journey details');document.body.append(dialog);
dialog.addEventListener('close',()=>stopMedia(dialog));
export function openStory(item,index=0){
 stopMedia(dialog);dialog.replaceChildren();const close=el('button','×','dialog-close');close.type='button';close.setAttribute('aria-label','Close story');close.onclick=()=>dialog.close();
 const heading=el('header',undefined,'story-heading');heading.append(el('span',item.photoStory?'PHOTO / STORY':item.kind==='education'?'EDUCATION / LEARNING':'MY JOURNEY / CHAPTER','story-kicker'),styledTitle(el('h2',item.title),itemKey(item)),el('p',dateLabel(item),'story-date'),item.checkpointEvents?eventLines(item.checkpointEvents,document):el('p',item.subtitle,'story-subtitle'));
 dialog.classList.toggle('photo-story-dialog',item.photoStory===true);dialog.append(close,heading,el('p',item.description,'story-copy'));if(item.public===false)heading.prepend(el('span','🔒 Private · visible only to you','private-badge'));const tags=el('div',undefined,'tags');for(const t of item.tags||[])tags.append(el('span',t));dialog.append(tags,storyGallery(item));dialog.showModal();
}

dialog.onclick=e=>{if(e.target===dialog&&!(e.clientX>=dialog.getBoundingClientRect().left&&e.clientX<=dialog.getBoundingClientRect().right&&e.clientY>=dialog.getBoundingClientRect().top&&e.clientY<=dialog.getBoundingClientRect().bottom))dialog.close();};
export function drawJourney(items){renderDatedRoute(items,{openStory,dateLabel,styledTitle,descriptions:currentView.mediaDescriptions,layoutPreferences:currentView.timelineLayout,canEdit:currentView.adminView===true,onSaveLayout:saveTimelineLayout});}

async function saveTimelineLayout(positions){
 const before=currentView;if(!before.adminView)throw Error('Administrator required');const response=await fetch('/api/portfolio/content/layout',{method:'PATCH',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:before.version,positions})});const saved=await response.json();if(!response.ok)throw Error(saved.error||'Unable to save layout');if(!currentView.adminView)throw Error('Session changed. Sign in again.');
 document.dispatchEvent(new CustomEvent('portfolio:layout-saved',{detail:saved}));renderPortfolio({...currentView,timelineLayout:saved.positions,version:saved.version});const status=document.querySelector('.timeline-layout-tools [role=status]');if(status)status.textContent='Layout saved';
}
let audio,trackId,currentView=normalizePortfolio({...defaultPortfolio,profile:{...defaultPortfolio.profile,portrait:''}});
export const getPortfolioView=()=>currentView;
export function renderPortfolio(input){
 document.body.classList.toggle('touch-portfolio',isTouchInterface());closeImageZoom();if(dialog.open)dialog.close();const value=normalizePortfolio(input),p=value.profile;currentView=value;setMediaTypes(value.mediaTypes);setPhotoDescriptions(value.mediaDescriptions,value.mediaTypes);setTitleStyles(value.titleStyles);
 const h=document.querySelector('.hero h1');h.replaceChildren(styledTitle(el('span',p.name),'profile-name'),el('br'),styledTitle(el('span',p.headline,'gradient'),'profile-headline'));
 document.querySelector('.hero-summary').textContent=p.summary;
 document.querySelector('.hero .eyebrow').textContent=`${p.name.toUpperCase()} / ${p.identityLine}`;
 const about=document.querySelector('#about>div:last-child'),paragraphs=about.querySelectorAll(':scope>p:not(.eyebrow)');paragraphs[0].textContent=p.about;paragraphs[0].style.whiteSpace='pre-line';paragraphs[1]?.remove();
 const portraitImage=document.querySelector('.portrait-frame img');updatePortrait(portraitImage,p.portrait||'',p.name);document.querySelector('.portrait-caption .mono').textContent=p.name.toUpperCase();if(portraitImage.dataset.mediaId!==p.portrait)describePhoto(portraitImage,p.portrait);portraitVideo(p);

 const links=document.querySelector('.contact-links');links.replaceChildren();for(const [text,url]of [[p.email,`mailto:${p.email}`],[p.phone,`tel:${p.phone}`]].filter(([text])=>text)){const a=el('a',text+' ↗');a.href=url;links.append(a);}
 const skills=document.querySelector('.expertise-grid');skills.replaceChildren();value.skills.forEach((s,i)=>{const card=el('article',undefined,'expertise-card skill-card');if(s.public===false)card.append(el('span','🔒 Private','private-badge'));card.append(el('span',String(i+1).padStart(2,'0'),'skill-number'),el('span',s.subtitle,'mono muted'),styledTitle(el('h3',s.title),`item-skills-${s.id}`),el('p',s.description));if(s.media.length){const more=el('button','Explore skill ↗','text-button');more.onclick=()=>openStory({...s,group:'skills'});card.append(more);}skills.append(card);});document.getElementById('expertise').hidden=!(value.skills.length||value.toolkit.length);
 let toolkit=document.getElementById('skill-toolkit');if(!toolkit){toolkit=el('div',undefined,'skill-toolkit');toolkit.id='skill-toolkit';skills.before(toolkit);}toolkit.replaceChildren();for(const item of value.toolkit){const badge=styledTitle(el('button',item.title,'toolkit-badge'),`item-toolkit-${item.id}`);badge.type='button';badge.onclick=()=>openStory({...item,group:'toolkit'});if(item.public===false)badge.classList.add('private-entry');toolkit.append(badge);}
 const entries=timelineEntries(value);drawJourney(entries);document.getElementById('experience').hidden=!entries.length;
 const education=document.querySelector('.education-grid');education.replaceChildren();education.hidden=true;

 disposeMediaRails();
 for(const group of ['activities','hobbies','family','notes']){
 const section=document.getElementById(`personal-${group}`);section.hidden=!value[group].length;const grid=section.querySelector('.personal-grid');grid.replaceChildren();
 if(group!=='notes'&&value[group].some(item=>item.media.length))grid.append(mediaRail(value[group].filter(item=>item.media.length),{group,descriptions:value.mediaDescriptions,openStory}));
 for(const item of value[group].filter(item=>group==='notes'||!item.media.length)){
 const card=el('article',undefined,'personal-card personal-story'),copy=el('div',undefined,'personal-story-copy');
 const update=id=>{const info=value.mediaDescriptions[id]||{};copy.replaceChildren();if(item.public===false)copy.append(el('span','🔒 Private','private-badge'));copy.append(el('span',item.subtitle,'eyebrow'),styledTitle(el('h3',info.title||item.title),info.title?`photo-${id.replace(/[^a-zA-Z0-9_-]/g,'-')}`:`item-${group}-${item.id}`),el('p',info.description||item.description,'personal-photo-copy'));const more=el('button','View details ↗','text-button');more.type='button';more.onclick=()=>openStory({...item,group});copy.append(more);copy.classList.remove('photo-copy-out');copy.classList.add('photo-copy-enter');};
 if(item.media.length)card.append(storyCarousel(item.media,item.title,{rotate:true,descriptions:value.mediaDescriptions,onChange:update,onTransition:phase=>{if(phase==='out'){copy.classList.remove('photo-copy-enter');copy.classList.add('photo-copy-out');}}}));else{card.append(el('span',group==='family'?'♡':'↗','personal-art'));update('');}card.append(copy);grid.append(card);
 }
 }

 const year=el('span',String(new Date().getFullYear()));year.id='year';document.querySelector('.site-footer>.mono').replaceChildren(document.createTextNode('© '),year,document.createTextNode(' '+p.name.toUpperCase()));
 const intro=document.getElementById('personal-intro'),player=document.getElementById('intro-player');intro.hidden=true;stopMedia(player);player.replaceChildren();
 const hero=document.querySelector('.hero-image');hero.style.backgroundImage=p.heroImage?`url("${mediaURL(p.heroImage)}")`:'none';
 const music=document.getElementById('portfolio-music');music.hidden=false;music.disabled=!p.music;if(trackId!==p.music){audio?.pause();audio=undefined;trackId=p.music;music.textContent='♫ Play soundtrack';music.setAttribute('aria-pressed','false');}if(!p.music)music.textContent='♫ Soundtrack';music.title=p.music?p.musicTitle:'No soundtrack uploaded yet';music.onclick=async()=>{if(!audio){audio=new Audio(mediaURL(p.music));audio.preload='none';audio.loop=true;audio.volume=.25;audio.onerror=()=>{music.textContent='♫ Track unavailable';music.setAttribute('aria-pressed','false');};}if(audio.paused){try{await audio.play();music.textContent='Ⅱ Pause music';music.setAttribute('aria-pressed','true');}catch{music.textContent='♫ Tap to try again';}}else{audio.pause();music.textContent='♫ Play soundtrack';music.setAttribute('aria-pressed','false');}};applyCopy(value.copy);applyPageTitles();document.getElementById('about').style.setProperty('--about-photo',`url("${mediaURL(p.aboutImage)}")`);initAboutMatrix();initPersonalMotion();document.dispatchEvent(new CustomEvent('portfolio:content',{detail:value}));
}
export function initPortfolio(onContent){renderPortfolio(currentView);(window.__portfolioContent||(window.__portfolioContent=fetch('/api/portfolio/content/',{credentials:'same-origin',cache:'no-store'}).then(r=>{if(!r.ok)throw Error();return r.json();}).catch(()=>null))).then(v=>{if(!v)return;if(onContent)onContent(v);else renderPortfolio(v);}).catch(()=>{});}

document.addEventListener('visibilitychange',()=>{document.getElementById('experience-list').dataset.paused=String(document.hidden);if(document.hidden)document.querySelectorAll('.journey-peek video').forEach(v=>v.pause());});

document.addEventListener('portfolio:input-mode',()=>{if(!document.querySelector('.editing-timeline-layout'))renderPortfolio(currentView);});
