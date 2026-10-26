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
import {defaultPortfolio,mediaURL,normalizePortfolio} from './portfolio-model.js';
const ns='http://www.w3.org/2000/svg';
export const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const svg=(tag,attrs)=>{const n=document.createElementNS(ns,tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,v);return n;};
export const dateLabel=item=>{const format=value=>item.datePrecision==='year'?value.slice(0,4):new Date(value+'T00:00:00Z').toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'});return item.date?format(item.date)+(item.end?' — '+format(item.end):item.kind==='milestone'?'':' — Present'):item.subtitle;};
const itemKey=item=>`item-${item.sourceGroup||item.group||'journey'}-${item.id}`;

export const storyGallery=item=>storyCarousel(item.media||[],item.title,{descriptions:currentView.mediaDescriptions});
const dialog=el('dialog',undefined,'story-dialog');dialog.setAttribute('aria-label','Journey details');document.body.append(dialog);
dialog.addEventListener('close',()=>stopMedia(dialog));
export function openStory(item,index=0){
 stopMedia(dialog);dialog.replaceChildren();const close=el('button','×','dialog-close');close.type='button';close.setAttribute('aria-label','Close story');close.onclick=()=>dialog.close();
 const heading=el('header',undefined,'story-heading');heading.append(el('span',item.kind==='education'?'EDUCATION / LEARNING':'MY JOURNEY / CHAPTER','story-kicker'),styledTitle(el('h2',item.title),itemKey(item)),el('p',dateLabel(item),'story-date'),el('p',item.subtitle,'story-subtitle'));
 dialog.append(close,heading,el('p',item.description,'story-copy'));if(item.public===false)heading.prepend(el('span','🔒 Riêng tư · chỉ admin xem được','private-badge'));const tags=el('div',undefined,'tags');for(const t of item.tags||[])tags.append(el('span',t));dialog.append(tags,storyGallery(item));dialog.showModal();
}

dialog.onclick=e=>{if(e.target===dialog&&!(e.clientX>=dialog.getBoundingClientRect().left&&e.clientX<=dialog.getBoundingClientRect().right&&e.clientY>=dialog.getBoundingClientRect().top&&e.clientY<=dialog.getBoundingClientRect().bottom))dialog.close();};
export function drawJourney(items){renderDatedRoute(items,{openStory,dateLabel,styledTitle});}

let audio,trackId,currentView=normalizePortfolio(defaultPortfolio);
export const getPortfolioView=()=>currentView;
export function renderPortfolio(input){
 closeImageZoom();if(dialog.open)dialog.close();const value=normalizePortfolio(input),p=value.profile;currentView=value;setMediaTypes(value.mediaTypes);setPhotoDescriptions(value.mediaDescriptions,value.mediaTypes);setTitleStyles(value.titleStyles);
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

 for(const group of ['activities','hobbies','family','notes']){
 const section=document.getElementById(`personal-${group}`);section.hidden=!value[group].length;const grid=section.querySelector('.personal-grid');grid.replaceChildren();
 for(const item of value[group]){
 const card=el('article',undefined,'personal-card personal-story'),copy=el('div',undefined,'personal-story-copy');
 const update=id=>{const info=value.mediaDescriptions[id]||{};copy.replaceChildren();if(item.public===false)copy.append(el('span','🔒 Riêng tư','private-badge'));copy.append(el('span',item.subtitle,'eyebrow'),styledTitle(el('h3',info.title||item.title),info.title?`photo-${id.replace(/[^a-zA-Z0-9_-]/g,'-')}`:`item-${group}-${item.id}`),el('p',info.description||item.description,'personal-photo-copy'));const more=el('button','Xem chi tiết ↗','text-button');more.type='button';more.onclick=()=>openStory({...item,group});copy.append(more);copy.classList.remove('photo-copy-enter');void copy.offsetWidth;copy.classList.add('photo-copy-enter');};
 if(item.media.length)card.append(storyCarousel(item.media,item.title,{rotate:true,descriptions:value.mediaDescriptions,onChange:update}));else{card.append(el('span',group==='family'?'♡':'↗','personal-art'));update('');}card.append(copy);grid.append(card);
 }
 }

 const year=el('span',String(new Date().getFullYear()));year.id='year';document.querySelector('.site-footer>.mono').replaceChildren(document.createTextNode('© '),year,document.createTextNode(' '+p.name.toUpperCase()));
 const intro=document.getElementById('personal-intro'),player=document.getElementById('intro-player');intro.hidden=true;stopMedia(player);player.replaceChildren();
 const hero=document.querySelector('.hero-image');hero.style.backgroundImage=p.heroImage?`url("${mediaURL(p.heroImage)}")`:'none';
 const music=document.getElementById('portfolio-music');music.hidden=false;music.disabled=!p.music;if(trackId!==p.music){audio?.pause();audio=undefined;trackId=p.music;music.textContent='♫ Play soundtrack';music.setAttribute('aria-pressed','false');}if(!p.music)music.textContent='♫ Soundtrack';music.title=p.music?p.musicTitle:'No soundtrack uploaded yet';music.onclick=async()=>{if(!audio){audio=new Audio(mediaURL(p.music));audio.preload='none';audio.loop=true;audio.volume=.25;audio.onerror=()=>{music.textContent='♫ Track unavailable';music.setAttribute('aria-pressed','false');};}if(audio.paused){try{await audio.play();music.textContent='Ⅱ Pause music';music.setAttribute('aria-pressed','true');}catch{music.textContent='♫ Tap to try again';}}else{audio.pause();music.textContent='♫ Play soundtrack';music.setAttribute('aria-pressed','false');}};applyCopy(value.copy);applyPageTitles();document.dispatchEvent(new CustomEvent('portfolio:content',{detail:value}));
}
export function initPortfolio(onContent){renderPortfolio(defaultPortfolio);fetch('/api/portfolio/content/').then(r=>{if(!r.ok)throw Error();return r.json();}).then(v=>{renderPortfolio(v);onContent(v);}).catch(()=>{});}

document.addEventListener('visibilitychange',()=>{document.getElementById('experience-list').dataset.paused=String(document.hidden);if(document.hidden)document.querySelectorAll('.journey-peek video').forEach(v=>v.pause());});
