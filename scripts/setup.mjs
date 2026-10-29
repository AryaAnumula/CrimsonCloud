import 'dotenv/config';
import mysql from 'mysql2/promise';
import { MongoClient } from 'mongodb';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { statements } from './sql-files.mjs';

let sql;
const mongo = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
try {
  if (!process.env.DATABASE_URL) throw new Error('Run npm run configure and edit .env first');
  const url = new URL(process.env.DATABASE_URL);
  const database = url.pathname.slice(1);
  if (!/^[a-zA-Z0-9_]+$/.test(database)) throw new Error('Use a simple database name in DATABASE_URL');
  url.pathname = '/';
  sql = await mysql.createConnection(url.href);
  await sql.query('CREATE DATABASE IF NOT EXISTS `' + database + '` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci');
  await sql.query('USE `' + database + '`');
  await sql.query("SET time_zone = '+00:00'");
  await sql.query(`CREATE TABLE IF NOT EXISTS schema_migration (
    filename varchar(100) PRIMARY KEY, checksum char(64) NOT NULL,
    applied_at datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB`);
  for (const name of ['01_schema.sql', '02_workflows.sql']) {
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
  await mongo.connect();
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
  if (!(await db.listCollections({ name: 'screening_submissions' }).hasNext()))
    await db.createCollection('screening_submissions', { validator });
  else await db.command({ collMod: 'screening_submissions', validator, validationLevel: 'strict', validationAction: 'error' });
  await db.collection('screening_submissions').createIndex({ submission_id: 1 }, { unique: true });
  await db.collection('screening_submissions').createIndex({ donation_id: 1 }, { unique: true });
  await db.collection('screening_submissions').createIndex({ form_version: 1, decision: 1 });
  console.log('MongoDB collection validation and indexes ready.');
} finally { await sql?.end().catch(() => {}); await mongo.close().catch(() => {}); }
