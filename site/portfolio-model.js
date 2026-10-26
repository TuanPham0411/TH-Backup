import {experience,projects} from './content.js';
export const groups=['skills','journey','activities','family','projects','education'];
export const mediaURL=id=>id?.startsWith('asset:')?id.slice(6):`/api/portfolio/content/media/${encodeURIComponent(id)}`;
const dates=['2026-07-01','2025-03-01','2023-06-01','2022-04-01','2019-09-01','2016-10-01'];
export const defaultPortfolio={version:0,profile:{name:'Pham Hoang Tuan',headline:'OT. Software. Data.',summary:'Operational Technical Engineer at Pepperl+Fuchs Vietnam. My work connects production systems, software tools and data analysis.',about:'I work on the systems that production teams rely on: networks, line software, MES and test equipment. My background in mechatronics and software technology helps me connect physical processes with digital systems.\n\nAt Pepperl+Fuchs Vietnam, I investigate incidents, support production systems and collaborate with Global OT and local IT. I’m also developing my skills in data analysis and building personal software and embedded projects.',email:'eric.scorp93@gmail.com',phone:'+84903326617',portrait:'asset:/images/profile.webp',music:'',musicPublic:false,musicTitle:'My soundtrack'},skills:[
{id:'operations',title:'OT & industrial systems',subtitle:'Operations',description:'Production network diagnostics, MES support, incident analysis and collaboration across OT and IT.',tags:['MES','Networking','PLC foundations'],media:[],public:true},
{id:'software',title:'Software & engineering tools',subtitle:'Development',description:'Practical tools for reporting, equipment workflows and production improvements.',tags:['C# / C++','Python','SQL / NoSQL'],media:[],public:true},
{id:'data',title:'Data & test systems',subtitle:'Insight',description:'Test data retrieval and analysis, calibration planning and operational reporting.',tags:['Data analysis','Reporting','Calibration'],media:[],public:true}],
journey:experience.map(([label,title,subtitle,description],i)=>({id:`career-${i}`,date:dates[i],end:i?dates[i-1]:'',title,subtitle,description,label,tags:[],media:[],public:true})),activities:[],family:[],projects:projects.map(p=>({...p,title:p.name,public:true,media:[]})),education:[{id:'software-study',title:'Ho Chi Minh City University of Technology',subtitle:'2022 — 2025 / Software technology',description:'Software technology studies; expanding from industrial hardware into software.',tags:[],media:[],public:true},{id:'mechatronics-study',title:'Lilama 2 International College of Technology',subtitle:'2016 — 2019 / Mechatronics',description:'Advanced Diploma Level 5 of VQF Mechatronics and Bosch dual training.',tags:[],media:[],public:true}]};
export function publicPortfolio(value){const copy=structuredClone(value);for(const key of groups)copy[key]=copy[key].filter(x=>x.public===true);if(!copy.profile.musicPublic)copy.profile.music='';return copy;}
export function referencedMedia(value){const refs=new Set();if(value.profile.portrait)refs.add(value.profile.portrait);if(value.profile.music)refs.add(value.profile.music);for(const group of groups)for(const item of value[group])for(const id of item.media||[])refs.add(id);return refs;}
export function validatePortfolio(value){
 const text=(v,max)=>typeof v==='string'&&v.length<=max;
 if(!value||!Number.isInteger(value.version)||!value.profile)throw Error('Invalid content version');
 const p=value.profile;
 for(const [key,max]of Object.entries({name:100,headline:160,summary:1000,about:8000,email:254,phone:40,portrait:100,music:100,musicTitle:160}))if(!text(p[key],max))throw Error(`Invalid ${key}`);
 if(!p.name.trim()||!/^\S+@\S+\.\S+$/.test(p.email)||!/^[+\d ()-]*$/.test(p.phone)||typeof p.musicPublic!=='boolean')throw Error('Invalid profile');
 const ids=new Set();
 for(const key of groups){if(!Array.isArray(value[key])||value[key].length>100)throw Error('Maximum 100 entries per section');for(const e of value[key]){
 if(!e||!text(e.id,80)||!/^[a-zA-Z0-9_-]+$/.test(e.id)||ids.has(key+e.id)||!text(e.title,160)||!e.title.trim()||!text(e.subtitle,200)||!text(e.description,8000)||typeof e.public!=='boolean')throw Error(`Invalid ${key} entry`);ids.add(key+e.id);
 if(!Array.isArray(e.tags)||e.tags.length>20||e.tags.some(t=>!text(t,80))||!Array.isArray(e.media)||e.media.length>8||e.media.some(id=>!text(id,100)))throw Error('Invalid tags or images');
 if(key==='journey'){if(!/^\d{4}-\d{2}-\d{2}$/.test(e.date)||!Number.isFinite(Date.parse(e.date))||new Date(e.date).toISOString().slice(0,10)!==e.date||Number(e.date.slice(0,4))<1900||Number(e.date.slice(0,4))>2200)throw Error('A valid milestone start date is required');if(e.end&&(!/^\d{4}-\d{2}-\d{2}$/.test(e.end)||!Number.isFinite(Date.parse(e.end))||new Date(e.end).toISOString().slice(0,10)!==e.end||e.end<e.date))throw Error('Invalid milestone end date');}
 if(key==='projects')for(const field of ['url','source'])if(e[field]&&(!text(e[field],1000)||!/^https:\/\//.test(e[field])||!URL.canParse(e[field])))throw Error('Project links must use HTTPS');
 }}
 if(JSON.stringify(value).length>700000)throw Error('Content is too large');return value;
}
