import type {Metadata} from 'next';
import './globals.css';
export const metadata:Metadata={title:'SM TAP — ваша цифровая визитка',description:'Создайте свою цифровую визитку: WhatsApp, Telegram и все контакты по одной ссылке.',icons:{icon:'/assets/favicon.svg'},openGraph:{title:'SM TAP — больше чем просто контакт',description:'Ваши контакты. Ваш стиль. Одна ссылка.',type:'website'}};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="ru"><body>{children}</body></html>;}
