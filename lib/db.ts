import mysql, { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';

export type QueryResult = { rows: any[]; rowCount: number; insertId: number };
// mysql2 returns an array of result sets for a CALL (procedure output) and a plain
// ResultSetHeader for INSERT/UPDATE/DELETE. Both are flattened into one shape here so the task
// files never have to care which kind of statement they ran.
function normalize(raw: unknown): QueryResult {
  if (Array.isArray(raw)) {
    // CALL issue_blood emits one SELECT result set followed by a status packet.
    const rows = Array.isArray(raw[0]) ? raw[0] : raw;
    return { rows, rowCount: rows.length, insertId: 0 };
  }
  const result = raw as ResultSetHeader;
  return { rows: [], rowCount: result.affectedRows, insertId: result.insertId };
}
const globalDb = globalThis as unknown as { bbmsMysql?: mysql.Pool };
const nativePool = globalDb.bbmsMysql ?? mysql.createPool({
  uri: process.env.DATABASE_URL,
  connectionLimit: 5,
  connectTimeout: 5000,
  waitForConnections: true,
  decimalNumbers: true,
  timezone: 'Z',
  multipleStatements: false,
});
if (process.env.NODE_ENV !== 'production') globalDb.bbmsMysql = nativePool;
// Every pooled connection is normalised before use: UTC session time zone (datetime(3) columns
// hold UTC), READ COMMITTED so reads never see another transaction's uncommitted rows, and
// @app_staff_id, the value the audit triggers read to record who changed a row.
async function prepare(connection: PoolConnection, actor: number | null) {
  await connection.query("SET time_zone = '+00:00'");
  await connection.query('SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED');
  await connection.query('SET @app_staff_id = ?', [actor]);
}
// Thin wrapper around one pooled connection. `execute` is used rather than `query` so values are
// always sent as bound parameters and never pasted into the SQL string.
export class DbConnection {
  constructor(public native: PoolConnection) {}
  async query(sql: string, params: any[] = []): Promise<QueryResult> {
    const [result] = await this.native.execute<RowDataPacket[] | ResultSetHeader>(sql, params);
    return normalize(result);
  }
}
// Checks a connection out of the pool, prepares it, runs the work, then always releases it.
// Clearing @app_staff_id in finally stops an identity from leaking into the next borrower.
export async function withConnection<T>(actor: number | null, work: (db: DbConnection) => Promise<T>) {
  const connection = await nativePool.getConnection();
  try { await prepare(connection, actor); return await work(new DbConnection(connection)); }
  finally {
    try { await connection.query('SET @app_staff_id = NULL'); } finally { connection.release(); }
  }
}
// Convenience runner for read-only queries that need neither an actor nor a transaction.
export const pool = { query: (sql: string, params: any[] = []) => withConnection(null, db => db.query(sql, params)) };
// One connection wrapped in BEGIN/COMMIT, with ROLLBACK on any thrown error. Every write path uses
// this, so a failure part-way through cannot leave a half-written donation or request behind.
export async function transaction<T>(actor: number | null, work: (db: DbConnection) => Promise<T>) {
  return withConnection(actor, async db => {
    await db.native.beginTransaction();
    try { const result = await work(db); await db.native.commit(); return result; }
    catch (error) { await db.native.rollback(); throw error; }
  });
}
