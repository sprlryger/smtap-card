import {cookies} from 'next/headers';
import {firebaseCall} from '../../../lib/firebase-auth';
export const dynamic='force-dynamic';
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export async function POST(req:Request){
 if(req.headers.get('origin')!==new URL(req.url).origin||req.headers.get('sec-fetch-site')==='cross-site')return reply({error:'Недопустимый запрос'},403);
 if(!req.headers.get('content-type')?.startsWith('application/json'))return reply({error:'Неверный формат'},415);
 try{const raw=await req.text();if(raw.length>4000)return reply({error:'Слишком большой запрос'},413);const {action,email,password}=JSON.parse(raw),jar=await cookies();
 const options={httpOnly:true,secure:true,sameSite:'lax' as const,path:'/'};
 if(action==='logout'){jar.set('__Host-sm-id','',{...options,maxAge:0});jar.set('__Host-sm-refresh','',{...options,maxAge:0});return reply({ok:true});}
 if(!['login','register','reset'].includes(action)||typeof email!=='string'||!/^\S+@\S+\.\S+$/.test(email)||email.length>254)return reply({error:'Проверьте почту'},400);
 if(action!=='reset'&&(typeof password!=='string'||password.length<8||password.length>128))return reply({error:'Пароль должен содержать от 8 до 128 символов'},400);
 const response=await firebaseCall(action==='register'?'signUp':action==='reset'?'sendOobCode':'signInWithPassword',action==='reset'?{requestType:'PASSWORD_RESET',email}:{email,password,returnSecureToken:true});const result=await response.json() as {error?:{message?:string};idToken:string;refreshToken:string};
 if(action==='reset'&&(response.ok||/EMAIL_NOT_FOUND/.test(result.error?.message||'')))return reply({ok:true,message:'Если аккаунт существует, письмо для восстановления отправлено. Проверьте также папку «Спам».'});
 if(!response.ok){const code=result.error?.message||'';const errors:Record<string,string>={EMAIL_EXISTS:'Эта почта уже зарегистрирована. Войдите или восстановите пароль.',OPERATION_NOT_ALLOWED:'Вход по почте пока не включён. Свяжитесь с SM TAP.',PASSWORD_LOGIN_DISABLED:'Вход по почте пока не включён. Свяжитесь с SM TAP.',TOO_MANY_ATTEMPTS_TRY_LATER:'Слишком много попыток. Повторите позже.',USER_DISABLED:'Этот аккаунт отключён.'};return reply({error:errors[code]||(/WEAK_PASSWORD/.test(code)?'Выберите более сложный пароль':'Не удалось войти. Проверьте почту и пароль.')},400);}
 jar.set('__Host-sm-id',result.idToken,{...options,maxAge:3500});jar.set('__Host-sm-refresh',result.refreshToken,{...options,maxAge:60*60*24*30});return reply({ok:true});
 }catch{return reply({error:'Не удалось связаться с сервисом входа. Попробуйте ещё раз.'},503);}
}
