import { z } from 'zod';
const text=(n:number)=>z.string().trim().max(n);
const url=text(1000).refine(v=>{if(!v)return true;try{const u=new URL(v);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password&&!/[\u0000-\u001f\u007f]/.test(v);}catch{return false}},'Введите полный адрес https://…');
const phone=text(30).refine(v=>!v||/^\+?[0-9\s().-]{5,30}$/.test(v),'Проверьте номер телефона');
const username=text(64).refine(v=>!v||/^@?[a-zA-Z0-9_.]{1,63}$/.test(v),'Введите имя пользователя без ссылки');
export const profileSchema=z.object({
 name:text(100).min(1,'Укажите имя или название'),description:text(180),city:text(80),tagline:text(180),
 photo:z.string().max(350000).refine(v=>!v||/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v),'Фото должно быть PNG, JPEG или WebP'),
 phone, email:text(150).refine(v=>!v||z.string().email().safeParse(v).success,'Проверьте email'),
 whatsapp:phone,telegram:username,instagram:username,website:url,
 theme:z.enum(['dark','light']),organization:text(100),jobTitle:text(100),
 links:z.array(z.object({id:text(60),title:text(80).min(1),subtitle:text(120),url,enabled:z.boolean()})).max(10)
});
export type Profile=z.infer<typeof profileSchema>;
export const emptyProfile:Profile={name:'',description:'',city:'',tagline:'',photo:'',phone:'',email:'',whatsapp:'',telegram:'',instagram:'',website:'',theme:'dark',organization:'',jobTitle:'',links:[]};
export const brandProfile:Profile={...emptyProfile,name:'SM TAP',description:'NFC-визитки · Бишкек',tagline:'Больше чем просто контакт',phone:'+996550229007',whatsapp:'+996550229007',telegram:'sprlryger',instagram:'sprlryger',website:'https://sprlryger.github.io/nfcsprlmiko/',organization:'SM TAP'};
export function contactLinks(p:Profile){return [
 {type:'whatsapp',title:'WhatsApp',subtitle:'Написать сообщение',url:p.whatsapp?'https://wa.me/'+p.whatsapp.replace(/\D/g,''):''},
 {type:'telegram',title:'Telegram',subtitle:'Связаться напрямую',url:p.telegram?'https://t.me/'+p.telegram.replace(/^@/,''):''},
 {type:'instagram',title:'Instagram',subtitle:'Посмотреть профиль',url:p.instagram?'https://www.instagram.com/'+p.instagram.replace(/^@/,'')+'/':''},
 {type:'website',title:'Сайт',subtitle:'Подробнее обо мне',url:p.website},
 ...p.links.filter(x=>x.enabled).map(x=>({...x,type:'link'}))
].filter(x=>x.url&&url.safeParse(x.url).success);}
export function vcard(p:Profile){const esc=(s:string)=>s.replace(/\\/g,'\\\\').replace(/\r\n|\r|\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');
const rows=['BEGIN:VCARD','VERSION:3.0','FN:'+esc(p.name),'N:'+esc(p.name)+';;;;'];
for(const [k,v] of [['ORG',p.organization],['TITLE',p.jobTitle],['TEL;TYPE=CELL',p.phone||p.whatsapp],['EMAIL;TYPE=INTERNET',p.email],['URL',p.website],['NOTE',p.description]])if(v)rows.push(k+':'+esc(v));rows.push('END:VCARD');
return rows.map(s=>{let result='',bytes=0;for(const c of s){const n=new TextEncoder().encode(c).length;if(bytes+n>75){result+='\r\n ';bytes=1;}result+=c;bytes+=n;}return result;}).join('\r\n')+'\r\n';}
