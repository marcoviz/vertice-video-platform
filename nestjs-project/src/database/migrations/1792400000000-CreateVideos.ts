import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateVideos1792400000000 implements MigrationInterface {
  name = 'CreateVideos1792400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE "videos" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "slug" uuid NOT NULL,
                "channel_id" uuid NOT NULL,
                "title" character varying(160) NOT NULL,
                "filename" character varying(180) NOT NULL,
                "content_type" character varying(80) NOT NULL,
                "byte_size" bigint NOT NULL,
                "status" character varying(16) NOT NULL DEFAULT 'draft',
                "source_key" text NOT NULL,
                "upload_id" text,
                "playback_key" text,
                "thumbnail_key" text,
                "duration_seconds" double precision,
                "metadata" jsonb,
                "error_code" character varying(80),
                "queued_at" TIMESTAMP WITH TIME ZONE,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_5dbcc1ee100f853490582eccc71" UNIQUE ("slug"),
                CONSTRAINT "UQ_a9a68fdfc777b235a4c47bbbea5" UNIQUE ("source_key"),
                CONSTRAINT "CHK_videos_status" CHECK (
                    "status" IN ('draft', 'processing', 'ready', 'failed')
                ),
                CONSTRAINT "CHK_videos_byte_size" CHECK (
                    "byte_size" BETWEEN 1 AND 10000000000
                ),
                CONSTRAINT "PK_e4c86c0cf95aff16e9fb8220f6b" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_videos_dispatch" ON "videos" ("status")
        `);
    await queryRunner.query(`
            ALTER TABLE "videos"
            ADD CONSTRAINT "FK_023a8e4f3f1a34ff3d8ca04a4cc" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "videos" DROP CONSTRAINT "FK_023a8e4f3f1a34ff3d8ca04a4cc"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_videos_dispatch"
        `);
    await queryRunner.query(`
            DROP TABLE "videos"
        `);
  }
}
