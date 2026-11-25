import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
export const profiles = sqliteTable('profiles', {
 id: text('id').primaryKey(), ownerId: text('owner_id').notNull(),
 data: text('data').notNull(), published: integer('published').notNull().default(0),
 revision: integer('revision').notNull().default(1), updatedAt: text('updated_at').notNull()
}, table => [index('profiles_owner_updated_idx').on(table.ownerId, table.updatedAt)]);
