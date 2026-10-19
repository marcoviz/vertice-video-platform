// One-time generation against the disposable verification database BEFORE applying phase 03.
require('ts-node/register');
const { AppDataSource } = require('../src/database/data-source');
const { CreateUsersAndChannels1775687773260 } = require('../src/database/migrations/1775687773260-CreateUsersAndChannels');
const { CreateAuthTokens1777579850478 } = require('../src/database/migrations/1777579850478-CreateAuthTokens');

async function main() {
  AppDataSource.setOptions({ migrations: [CreateUsersAndChannels1775687773260, CreateAuthTokens1777579850478] });
  await AppDataSource.initialize();
  try {
    const [{ relation }] = await AppDataSource.query("SELECT to_regclass('public.videos') AS relation");
    if (relation) throw new Error('Refusing migration regeneration: videos table already exists');
    await AppDataSource.runMigrations();
  } finally {
    await AppDataSource.destroy();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
