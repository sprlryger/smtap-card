import { getAccount } from '../../../lib/firebase-auth';
import { getDb } from '../../../db';
import { profiles } from '../../../db/schema';
import { and, desc, eq, sql } from 'drizzle-orm';
import { profileSchema } from '../../../lib/profile';

export const dynamic = 'force-dynamic';
const validId = (id: unknown): id is string => typeof id === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id);
const reply = (data: unknown, status = 200) => Response.json(data, {
  status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
});
const sameOrigin = (req: Request) => req.headers.get('origin') === new URL(req.url).origin && req.headers.get('sec-fetch-site') !== 'cross-site';

export async function GET(req: Request) {
  const user = await getAccount().catch(() => null);
  if (!user) return reply({ error: 'Войдите в свой аккаунт SM TAP, чтобы открыть кабинет.' }, 401);
  try {
    const db = getDb(), id = new URL(req.url).searchParams.get('id');
    if (id !== null) {
      if (!validId(id)) return reply({ error: 'Неверный адрес визитки.' }, 400);
      const row = await db.select().from(profiles).where(and(eq(profiles.id, id), eq(profiles.ownerId, user.userId))).get();
      if (!row) return reply({ error: 'Визитка не найдена в вашем кабинете.' }, 404);
      return reply({ profile: { id: row.id, data: JSON.parse(row.data), published: !!row.published, revision: row.revision, updatedAt: row.updatedAt } });
    }
    // Summaries avoid downloading every client's contact details and photo.
    const rows = await db.select({
      id: profiles.id, name: sql<string>`json_extract(${profiles.data}, '$.name')`,
      description: sql<string>`json_extract(${profiles.data}, '$.description')`,
      published: profiles.published, revision: profiles.revision, updatedAt: profiles.updatedAt
    }).from(profiles).where(eq(profiles.ownerId, user.userId)).orderBy(desc(profiles.updatedAt), profiles.id);
    return reply({ profiles: rows.map(row => ({ ...row, published: !!row.published })) });
  } catch { return reply({ error: 'Не удалось загрузить визитки. Повторите попытку.' }, 503); }
}

export async function POST(req: Request) {
  const user = await getAccount().catch(() => null);
  if (!user) return reply({ error: 'Нужен вход в ваш аккаунт SM TAP.' }, 401);
  if (!sameOrigin(req)) return reply({ error: 'Недопустимый источник запроса.' }, 403);
  if (!req.headers.get('content-type')?.startsWith('application/json')) return reply({ error: 'Неверный формат запроса.' }, 415);
  if (Number(req.headers.get('content-length') || 0) > 400000) return reply({ error: 'Данные слишком большие.' }, 413);
  try {
    const reader = req.body?.getReader();
    if (!reader) return reply({ error: 'Пустой запрос.' }, 400);
    let bytes = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 400000) { await reader.cancel(); return reply({ error: 'Данные слишком большие.' }, 413); }
      chunks.push(value);
    }
    const body = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
    const input = JSON.parse(new TextDecoder().decode(body));
    if (!input || typeof input !== 'object' || Array.isArray(input)) return reply({ error: 'Проверьте данные запроса.' }, 400);
    const parsed = profileSchema.safeParse(input.data);
    if (!parsed.success) return reply({ error: parsed.error.issues[0]?.message || 'Проверьте поля формы.' }, 400);
    if (typeof input.published !== 'boolean' || !Number.isSafeInteger(input.revision) || input.revision < 0) return reply({ error: 'Неверная версия данных.' }, 400);
    if (input.id != null && !validId(input.id)) return reply({ error: 'Неверный адрес визитки.' }, 400);
    if (input.id == null && input.revision !== 0) return reply({ error: 'Обновите страницу и выберите визитку в кабинете.' }, 409);

    const db = getDb();
    const row = input.id == null ? undefined : await db.select().from(profiles)
      .where(and(eq(profiles.id, input.id), eq(profiles.ownerId, user.userId))).get();
    if (input.id != null && !row) return reply({ error: 'Визитка не найдена в вашем кабинете.' }, 404);
    if (row && input.revision !== row.revision) return reply({ error: 'Визитка изменена в другом окне. Откройте её заново перед сохранением.' }, 409);
    const recent = row || await db.select({ updatedAt: profiles.updatedAt }).from(profiles)
      .where(eq(profiles.ownerId, user.userId)).orderBy(desc(profiles.updatedAt)).limit(1).get();
    if (recent && Date.now() - Date.parse(recent.updatedAt) < 1500) return reply({ error: 'Подождите пару секунд перед следующим сохранением.' }, 429);

    const id = row?.id || crypto.randomUUID(), updatedAt = new Date().toISOString(), revision = (row?.revision || 0) + 1;
    const values = { data: JSON.stringify(parsed.data), published: input.published ? 1 : 0, updatedAt, revision };
    if (row) {
      const changed = await db.update(profiles).set(values).where(and(
        eq(profiles.id, row.id), eq(profiles.ownerId, user.userId), eq(profiles.revision, row.revision)
      )).returning({ id: profiles.id });
      if (!changed.length) return reply({ error: 'Конфликт изменений. Откройте визитку заново.' }, 409);
    } else await db.insert(profiles).values({ id, ownerId: user.userId, ...values });
    return reply({ id, revision, updatedAt, published: input.published });
  } catch (e) {
    if (e instanceof SyntaxError) return reply({ error: 'Неверный JSON.' }, 400);
    return reply({ error: 'Сохранение не выполнено. Проверьте соединение и повторите.' }, 503);
  }
}

export async function DELETE(req: Request) {
  if (!sameOrigin(req)) return reply({ error: 'Недопустимый источник запроса.' }, 403);
  const user = await getAccount().catch(() => null);
  if (!user) return reply({ error: 'Нужен вход в ваш аккаунт SM TAP.' }, 401);
  const params = new URL(req.url).searchParams, id = params.get('id'), revision = Number(params.get('revision'));
  if (!validId(id) || !Number.isSafeInteger(revision) || revision < 1) return reply({ error: 'Выберите визитку для удаления.' }, 400);
  try {
    const db = getDb();
    const row = await db.select({ revision: profiles.revision }).from(profiles)
      .where(and(eq(profiles.id, id), eq(profiles.ownerId, user.userId))).get();
    if (!row) return reply({ error: 'Визитка не найдена в вашем кабинете.' }, 404);
    if (row.revision !== revision) return reply({ error: 'Визитка изменилась. Откройте её заново перед удалением.' }, 409);
    const deleted = await db.delete(profiles).where(and(eq(profiles.id, id), eq(profiles.ownerId, user.userId), eq(profiles.revision, revision))).returning({ id: profiles.id });
    if (!deleted.length) return reply({ error: 'Визитка изменилась. Откройте её заново перед удалением.' }, 409);
    return reply({ ok: true });
  } catch { return reply({ error: 'Не удалось удалить визитку.' }, 503); }
}
