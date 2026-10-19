import { Channel } from '../channels/entities/channel.entity';
import { Video } from '../videos/entities/video.entity';
import { DataSource } from 'typeorm';
import type { DataSourceOptions, MigrationInterface } from 'typeorm';

interface TestDataSourceOptions {
  synchronize?: false;
  migrations?: (new () => MigrationInterface)[];
}

export function createTestDataSource(
  entities: DataSourceOptions['entities'],
  options: TestDataSourceOptions = {},
): DataSource {
  const { synchronize = false, migrations } = options;
  return new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST ?? 'db',
    port: Number(process.env.DB_PORT ?? 5432),
    username: process.env.DB_USERNAME ?? 'streamtube',
    password: process.env.DB_PASSWORD ?? 'streamtube',
    database: process.env.DB_DATABASE ?? 'streamtube',
    // Channel now has the inverse videos relation. Preserve isolated older
    // phase fixtures by including its metadata dependency automatically.
    entities:
      Array.isArray(entities) &&
      entities.includes(Channel) &&
      !entities.includes(Video)
        ? [...entities, Video]
        : entities,
    synchronize,
    ...(migrations !== undefined && { migrations, migrationsRun: false }),
  });
}

export async function cleanAllTables(dataSource: DataSource): Promise<void> {
  await dataSource.query('DELETE FROM "refresh_tokens"');
  await dataSource.query('DELETE FROM "verification_tokens"');
  await dataSource.query('DELETE FROM "channels"');
  await dataSource.query('DELETE FROM "users"');
}
