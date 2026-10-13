const {initializeTestEnvironment,assertSucceeds,assertFails}=require('@firebase/rules-unit-testing');
const {doc,setDoc,getDoc,getDocs,collection,query,where,updateDoc,serverTimestamp}=require('firebase/firestore');
const {readFileSync}=require('node:fs');
(async()=>{
const env=await initializeTestEnvironment({projectId:'demo-th-security',firestore:{host:'127.0.0.1',port:8085,rules:readFileSync('firestore.rules','utf8')}});
try{
const user=env.authenticatedContext('viewer',{email:'viewer@example.com',email_verified:true}).firestore();
const other=env.authenticatedContext('other',{email:'other@example.com',email_verified:true}).firestore();
const unverified=env.authenticatedContext('unverified',{email:'eric.scorp93@gmail.com',email_verified:false}).firestore();
const anon=env.unauthenticatedContext().firestore();
const data={uid:'viewer',email:'viewer@example.com',name:'Viewer',topic:'OT / MES',message:'Can we discuss an OT systems project?',status:'New',createdAt:serverTimestamp(),updatedAt:serverTimestamp()};
await assertSucceeds(setDoc(doc(user,'users/viewer'),{displayName:'Viewer',updatedAt:serverTimestamp()}));
await assertFails(setDoc(doc(user,'users/viewer'),{displayName:'Viewer',role:'admin',updatedAt:serverTimestamp()}));
await assertFails(getDoc(doc(other,'users/viewer')));
await assertFails(getDoc(doc(anon,'users/viewer')));
await assertSucceeds(setDoc(doc(user,'users/viewer/bookmarks/esp32'),{projectId:'esp32',createdAt:serverTimestamp()}));
await assertFails(setDoc(doc(user,'users/other/bookmarks/esp32'),{projectId:'esp32',createdAt:serverTimestamp()}));
await assertFails(setDoc(doc(user,'users/viewer/bookmarks/unknown'),{projectId:'unknown',createdAt:serverTimestamp()}));
await assertSucceeds(setDoc(doc(user,'inquiries/request'),data));
await assertFails(setDoc(doc(user,'inquiries/spoof'),{...data,email:'eric.scorp93@gmail.com'}));
await assertFails(setDoc(doc(user,'inquiries/owner-spoof'),{...data,uid:'other'}));
await assertFails(setDoc(doc(user,'inquiries/preclosed'),{...data,status:'Closed'}));
await assertFails(getDoc(doc(other,'inquiries/request')));
await assertFails(getDoc(doc(anon,'inquiries/request')));
await assertFails(getDocs(collection(user,'inquiries')));
await assertSucceeds(getDocs(query(collection(user,'inquiries'),where('uid','==','viewer'))));
await assertFails(updateDoc(doc(user,'inquiries/request'),{status:'Closed',updatedAt:serverTimestamp()}));
await assertFails(getDocs(collection(unverified,'inquiries')));
for(const email of ['eric.scorp93@gmail.com','tuanpham.x93@gmail.com']){
 const admin=env.authenticatedContext(email,{email,email_verified:true}).firestore();
 await assertSucceeds(getDocs(collection(admin,'inquiries')));
 await assertSucceeds(updateDoc(doc(admin,'inquiries/request'),{status:'Replied',updatedAt:serverTimestamp()}));
 await assertFails(updateDoc(doc(admin,'inquiries/request'),{email:'changed@example.com',updatedAt:serverTimestamp()}));
}
console.log('PASS: 23 security assertions covering owner-only data, email verification, spoofing, exact admin identities, scoped queries and status-only admin updates.');
}finally{await env.cleanup();}
})().catch(e=>{console.error(e);process.exit(1)});
