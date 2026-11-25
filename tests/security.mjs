import assert from 'node:assert/strict';
import {readFile,mkdtemp,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {build}=createRequire(require.resolve('drizzle-kit'))('esbuild');
const {Miniflare}=createRequire(require.resolve('wrangler'))('miniflare');
const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("test")}}',d1Databases:['DB'],compatibilityDate:'2026-05-15'});
const p={name:'Клиент; А,Б',description:'Описание',city:'Бишкек',tagline:'',photo:'',phone:'+996550229007',email:'',whatsapp:'+996550229007',telegram:'sprlryger',instagram:'',website:'',theme:'dark',organization:'',jobTitle:'',links:[]};
const legacyId=crypto.randomUUID();
try {
 globalThis.__env=await mf.getBindings();
 const files=(await readdir('drizzle')).filter(f=>f.endsWith('.sql')).sort();
 async function migrate(file){for(const sql of (await readFile(join('drizzle',file),'utf8')).split('--> statement-breakpoint'))if(sql.trim())await globalThis.__env.DB.prepare(sql.trim()).run();}
 await migrate(files[0]);
 await globalThis.__env.DB.prepare('INSERT INTO profiles(id,owner_id,data,published,revision,updated_at) VALUES(?,?,?,?,?,?)').bind(legacyId,'firebase:a',JSON.stringify({...p,name:'Старая визитка'}),1,7,'2020-01-01T00:00:00Z').run();
 for(const file of files.slice(1))await migrate(file);
 const legacy=await globalThis.__env.DB.prepare('SELECT * FROM profiles WHERE id = ?').bind(legacyId).first();
 assert.equal(legacy.revision,7);assert.equal(JSON.parse(legacy.data).name,'Старая визитка');assert.equal(legacy.published,1);
 const dir=await mkdtemp(join(tmpdir(),'sm-tap-tests-'));
 await build({entryPoints:['app/api/profile/route.ts'],bundle:true,format:'esm',platform:'node',outfile:join(dir,'route.mjs'),plugins:[{name:'test-boundaries',setup(b){
  b.onResolve({filter:/firebase-auth$/},()=>({path:'account',namespace:'mock'}));
  b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'mock'}));
  b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:a.path==='account'?'export async function getAccount(){return globalThis.__account;}':'export const env=globalThis.__env;',loader:'js'}));
 }}]});
 const api=await import(join(dir,'route.mjs'));
 const identity=id=>{globalThis.__account=id?{userId:'firebase:'+id,email:id+'@example.test'}:null;};
 function request(method,body,query='',origin='https://test.local',extra={}){return new Request('https://test.local/api/profile'+query,{method,headers:{origin,'content-type':'application/json',...extra},...(body===undefined?{}:{body:typeof body==='string'?body:JSON.stringify(body)})});}
 async function get(user,id){identity(user);return api.GET(request('GET',undefined,id?'?id='+id:''));}
 async function post(user,body,origin='https://test.local',extra={}){identity(user);return api.POST(request('POST',body,'',origin,extra));}
 async function del(user,id,revision,origin='https://test.local'){identity(user);return api.DELETE(request('DELETE',undefined,id?'?id='+id+'&revision='+revision:'',origin));}
 async function age(){await globalThis.__env.DB.prepare('UPDATE profiles SET updated_at = ?').bind('2020-01-01T00:00:00Z').run();}
 const payload=(name,id=null,revision=0)=>({id,data:{...p,name},published:true,revision});
 assert.equal((await get(null)).status,401);assert.equal((await post(null,{})).status,401);
 assert.equal((await del(null,legacyId,7)).status,401);
 assert.equal((await post('a',{},'https://evil.invalid')).status,403);
 assert.equal((await post('a',{},'https://test.local',{'sec-fetch-site':'cross-site'})).status,403);
 assert.equal((await post('a','null')).status,400);
 assert.equal((await post('a',{...payload('Bad'),data:{...p,website:'javascript:alert(1)'}})).status,400);
 assert.equal((await post('a',{...payload('Bad'),data:{...p,photo:'data:image/svg+xml;base64,PHN2Zz4='}})).status,400);
 let r=await post('a',payload('Первый клиент'));assert.equal(r.status,200);const first=await r.json();
 assert.notEqual(first.id,legacyId);
 assert.equal((await post('a',payload('Слишком быстро'))).status,429);
 await age();
 r=await post('a',payload('Второй клиент'));assert.equal(r.status,200);const second=await r.json();
 assert.notEqual(first.id,second.id);
 let rows=(await (await get('a')).json()).profiles;
 assert.equal(rows.length,3);assert(rows.some(row=>row.id===legacyId));assert(rows.every(row=>!('data' in row)&&!('ownerId' in row)&&!('photo' in row)));
 assert.equal((await (await get('a',first.id)).json()).profile.data.email,'');
 assert.equal((await (await get('b')).json()).profiles.length,0);
 r=await post('b',{...payload('Чужой кабинет'),ownerId:'firebase:a'});assert.equal(r.status,200);const other=await r.json();
 assert.equal((await globalThis.__env.DB.prepare('SELECT owner_id FROM profiles WHERE id = ?').bind(other.id).first()).owner_id,'firebase:b');
 assert.equal((await get('b',first.id)).status,404);
 assert.equal((await post('b',payload('Взлом',first.id,first.revision))).status,404);
 assert.equal((await del('b',first.id,first.revision)).status,404);
 assert.equal((await post('a',payload('Неверная версия',first.id,0))).status,409);
 assert.equal((await post('a',payload('Старый редактор',null,first.revision))).status,409);
 assert.equal((await post('a',payload('Bad','not-an-id',1))).status,400);
 await age();
 r=await post('a',{...payload('Новое имя',first.id,first.revision),published:false});assert.equal(r.status,200);const edited=await r.json();
 assert.equal(edited.id,first.id);assert.equal(edited.revision,2);assert.equal(edited.published,false);
 assert.equal((await (await get('a',second.id)).json()).profile.data.name,'Второй клиент');
 assert.equal((await (await get('a',legacyId)).json()).profile.revision,7);
 assert.equal((await post('a',payload('Старое окно',first.id,first.revision))).status,409);
 assert.equal((await post('a',payload('Слишком быстро',first.id,edited.revision))).status,429);
 assert.equal((await post('a',{data:'x'.repeat(410000)})).status,413);
 assert.equal((await del('a')).status,400);
 assert.equal((await del('a',second.id,99)).status,409);
 assert.equal((await del('a',second.id,second.revision,'https://evil.invalid')).status,403);
 assert.equal((await del('a',second.id,second.revision)).status,200);
 assert.equal((await get('a',second.id)).status,404);
 assert.equal((await (await get('a')).json()).profiles.length,2);
 assert.equal((await (await get('a',first.id)).json()).profile.data.name,'Новое имя');
 assert.equal((await (await get('b',other.id)).json()).profile.data.name,'Чужой кабинет');
 console.log('PASS: migration preserves existing cards; one account creates multiple independent cards without client email; stable IDs; owner isolation for list/read/update/delete; targeted deletion; CSRF, versions, throttling and payload validation.');
 await build({entryPoints:['lib/profile.ts'],bundle:true,format:'esm',platform:'node',outfile:join(dir,'profile.mjs')});const util=await import(join(dir,'profile.mjs'));
 assert.equal(util.contactLinks(p)[0].url,'https://wa.me/996550229007');
 assert.equal(util.contactLinks({...p,telegram:'@sprlryger'})[1].url,'https://t.me/sprlryger');
 assert.equal(util.contactLinks({...p,links:[{title:'Bad',url:'data:text/html,bad',enabled:true,id:'1',subtitle:''}]}).length,2);
 const vc=util.vcard({...p,description:'Я'.repeat(300)+'\nТест;1,2\\3'});
 assert(vc.includes('FN:Клиент\\; А\\,Б'));assert(!/(?<!\r)\n/.test(vc));
 for(const line of vc.split('\r\n'))assert(Buffer.byteLength(line)<=75);
 console.log('PASS: contact link generation and UTF-8 vCard escaping/folding.');
}finally{await mf.dispose();}
