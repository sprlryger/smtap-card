import { env } from 'cloudflare:workers';
import {cookies} from 'next/headers';
type AuthResult={users?:{localId:string;email:string;disabled?:boolean}[];id_token?:string};
function getFirebaseKey() {
 const key = env.FIREBASE_WEB_API_KEY;
 if (!key) throw new Error('FIREBASE_WEB_API_KEY is required');
 return key;
}
export async function firebaseCall(method:string,body:unknown){return fetch(`https://identitytoolkit.googleapis.com/v1/accounts:${method}?key=${getFirebaseKey()}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});}
export async function getAccount(){
 const jar=await cookies(),token=jar.get('__Host-sm-id')?.value,refresh=jar.get('__Host-sm-refresh')?.value;
 if(!token&&!refresh)return null;
 try{let idToken=token;if(idToken){const r=await firebaseCall('lookup',{idToken}),j=await r.json() as AuthResult;if(r.ok&&j.users?.[0]&&!j.users[0].disabled)return {userId:'firebase:'+j.users[0].localId,email:j.users[0].email};}
 if(!refresh)return null;
 const r=await fetch('https://securetoken.googleapis.com/v1/token?key='+getFirebaseKey(),{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:refresh}),signal:AbortSignal.timeout(15000)}),j=await r.json() as AuthResult;if(!r.ok||!j.id_token)return null;
 const check=await firebaseCall('lookup',{idToken:j.id_token}),u=await check.json() as AuthResult;return check.ok&&u.users?.[0]&&!u.users[0].disabled?{userId:'firebase:'+u.users[0].localId,email:u.users[0].email}:null;
 }catch{throw Error('Сервис входа временно недоступен. Попробуйте ещё раз.');}
}
