DROP INDEX `profiles_owner_id_unique`;--> statement-breakpoint
CREATE INDEX `profiles_owner_updated_idx` ON `profiles` (`owner_id`,`updated_at`);