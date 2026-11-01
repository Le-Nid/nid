import { Kysely, sql } from 'kysely'

// Created by 001 for an S3 storage never built: never read nor written, yet it had a column for an S3 secret key
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('storage_configs').ifExists().execute()
}

// Back to the empty table as 001 created it
export async function down(db: Kysely<any>): Promise<void> {
  await sql`CREATE TABLE storage_configs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type varchar(20) NOT NULL DEFAULT 'local',
    s3_endpoint varchar(512), s3_region varchar(64), s3_bucket varchar(255),
    s3_access_key_id varchar(255), s3_secret_access_key varchar(512),
    s3_force_path_style boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
  )`.execute(db)
  await sql`CREATE UNIQUE INDEX idx_storage_configs_user_id ON storage_configs(user_id)`.execute(db)
}
