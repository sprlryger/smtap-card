import { getDb } from '../../../db';
import { profiles } from '../../../db/schema';
import { and,eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import Card from '../../ui/Card';
export const dynamic='force-dynamic';
export default async function PublicCard({params}:{params:Promise<{id:string}>}){const {id}=await params;if(!/^[a-f0-9-]{36}$/.test(id))notFound();const row=await getDb().select().from(profiles).where(and(eq(profiles.id,id),eq(profiles.published,1))).get();if(!row)notFound();return <Card profile={JSON.parse(row.data)}/>;}
export async function generateMetadata({params}:{params:Promise<{id:string}>}){const {id}=await params;const row=await getDb().select().from(profiles).where(and(eq(profiles.id,id),eq(profiles.published,1))).get();if(!row)return {title:'Визитка недоступна — SM TAP'};const p=JSON.parse(row.data);return {title:p.name+' — SM TAP',description:p.description,openGraph:{title:p.name,description:p.description,type:'profile'}};}
