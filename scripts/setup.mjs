import 'dotenv/config';
import mysql from 'mysql2/promise';
import { MongoClient } from 'mongodb';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { statements } from './sql-files.mjs';

// Task: create both databases from nothing, and keep them reproducible.
// Phase 1 (MySQL): connect to the server without selecting a database, create the database if it is
// missing, then apply 01_schema.sql and 02_workflows.sql. Each file's SHA-256 is recorded in
// schema_migration, so a re-run skips what is already applied and refuses a file that changed after
// setup — that is what stops a half-upgraded database from looking correct.
// Phase 2 (MongoDB): create the collection with its $jsonSchema validator and indexes, or update an
// existing collection in place, so the NoSQL rules are versioned in code rather than by hand.
let sql;
const mongo = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
try {
  if (!process.env.DATABASE_URL) throw new Error('Run npm run configure and edit .env first');
  const url = new URL(process.env.DATABASE_URL);
  const database = url.pathname.slice(1);
  if (!/^[a-zA-Z0-9_]+$/.test(database)) throw new Error('Use a simple database name in DATABASE_URL');
  url.pathname = '/';
  // Task: Fail with an instruction, not a raw driver stack, when the MySQL login is wrong.
  try { sql = await mysql.createConnection(url.href); }
  catch (error) {
    const code = error?.code || 'unknown';
    throw new Error(`Cannot sign in to MySQL (${code}).\n` +
      '- Check that the MySQL service is running.\n' +
      '- Check the username/password in DATABASE_URL in .env (URL-encode special characters).\n' +
      `- Tried: ${url.host}${url.pathname}`, { cause: error });
  }
  await sql.query('CREATE DATABASE IF NOT EXISTS `' + database + '` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci');
  await sql.query('USE `' + database + '`');
  await sql.query("SET time_zone = '+00:00'");
  await sql.query(`CREATE TABLE IF NOT EXISTS schema_migration (
    filename varchar(100) PRIMARY KEY, checksum char(64) NOT NULL,
    applied_at datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB`);
  // Apply each file at most once; the stored checksum is the record of what already ran.
  for (const name of ['01_schema.sql', '02_workflows.sql', '06_expiring_soon.sql']) {
    const content = await readFile(new URL('../database/' + name, import.meta.url), 'utf8');
    const checksum = createHash('sha256').update(content).digest('hex');
    const [[prior]] = await sql.query('SELECT checksum FROM schema_migration WHERE filename = ?', [name]);
    if (prior) {
      if (prior.checksum !== checksum) throw new Error(name + ' changed after setup. Use a new database name for a fresh demo.');
      continue;
    }
    for (const statement of statements(content)) await sql.query(statement);
    await sql.execute('INSERT INTO schema_migration(filename, checksum) VALUES (?, ?)', [name, checksum]);
    console.log('Applied', name);
  }
  // Task: Same idea for MongoDB. The SQL files above are already committed by checksum,
  // so re-running setup after starting MongoDB only repeats the document setup.
  try { await mongo.connect(); }
  catch (error) {
    throw new Error(`MongoDB is not reachable at ${process.env.MONGODB_URI || '(MONGODB_URI is unset)'}.\n` +
      'Install/start MongoDB Community Server (default port 27017), then run npm run db:setup again.\n' +
      'The MySQL schema already applied in this run is recorded and will be skipped.', { cause: error });
  }
  const db = mongo.db(process.env.MONGODB_DB || 'blood_bank');
  const validator = { $jsonSchema: {
    bsonType: 'object', required: ['submission_id','donation_id','form_version','decision','answers','payload_hash','submitted_by','submitted_at'],
    properties: {
      submission_id: { bsonType: 'string', pattern: '^[0-9a-fA-F-]{36}$' },
      donation_id: { bsonType: ['int','long','double'], minimum: 1 },
      form_version: { bsonType: 'string', enum: ['v1'] },
      decision: { enum: ['APPROVED','REJECTED'] },
      payload_hash: { bsonType: 'string', pattern: '^[0-9a-f]{64}$' },
      submitted_by: { bsonType: ['int','long','double'], minimum: 1 },
      submitted_at: { bsonType: 'date' },
      answers: { bsonType: 'object', required: ['identity_confirmed','consent_recorded','review_note'],
        properties: { identity_confirmed: { bsonType: 'bool' }, consent_recorded: { bsonType: 'bool' },
          review_note: { bsonType: 'string', minLength: 1, maxLength: 1000 },
          follow_up: { bsonType: 'object', required: ['reason'], properties: { reason: { bsonType: 'string', minLength: 1, maxLength: 300 } } } } },
    },
  } };
  // First run creates the collection with validation; later runs update the validator in place
  // (collMod) so an existing demo database picks up rule changes without being dropped.
  if (!(await db.listCollections({ name: 'screening_submissions' }).hasNext()))
    await db.createCollection('screening_submissions', { validator });
  else await db.command({ collMod: 'screening_submissions', validator, validationLevel: 'strict', validationAction: 'error' });
  await db.collection('screening_submissions').createIndex({ submission_id: 1 }, { unique: true });
  await db.collection('screening_submissions').createIndex({ donation_id: 1 }, { unique: true });
  await db.collection('screening_submissions').createIndex({ form_version: 1, decision: 1 });
  console.log('MongoDB collection validation and indexes ready.');
} finally { await sql?.end().catch(() => {}); await mongo.close().catch(() => {}); }
