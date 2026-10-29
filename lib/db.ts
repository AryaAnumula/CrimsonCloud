import mysql, { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';

export type QueryResult = { rows: any[]; rowCount: number; insertId: number };
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
async function prepare(connection: PoolConnection, actor: number | null) {
  await connection.query("SET time_zone = '+00:00'");
  await connection.query('SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED');
  await connection.query('SET @app_staff_id = ?', [actor]);
}
export class DbConnection {
  constructor(public native: PoolConnection) {}
  async query(sql: string, params: any[] = []): Promise<QueryResult> {
    const [result] = await this.native.execute<RowDataPacket[] | ResultSetHeader>(sql, params);
    return normalize(result);
  }
}
export async function withConnection<T>(actor: number | null, work: (db: DbConnection) => Promise<T>) {
  const connection = await nativePool.getConnection();
  try { await prepare(connection, actor); return await work(new DbConnection(connection)); }
  finally {
    try { await connection.query('SET @app_staff_id = NULL'); } finally { connection.release(); }
  }
}
export const pool = { query: (sql: string, params: any[] = []) => withConnection(null, db => db.query(sql, params)) };
export async function transaction<T>(actor: number | null, work: (db: DbConnection) => Promise<T>) {
  return withConnection(actor, async db => {
    await db.native.beginTransaction();
    try { const result = await work(db); await db.native.commit(); return result; }
    catch (error) { await db.native.rollback(); throw error; }
  });
}
