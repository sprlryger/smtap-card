import {getAccount} from '../lib/firebase-auth';
import Studio from './ui/Studio';
export const dynamic='force-dynamic';
export default async function Home(){const user=await getAccount().catch(()=>null);return <Studio signedIn={!!user} signIn='/login' signOut='/api/auth'/>;}
