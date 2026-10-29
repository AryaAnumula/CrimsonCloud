// Task: fill reference data only — two login accounts and the eight blood groups, never stock.
// Safe to re-run: if any staff row exists the accounts are left untouched (passwords are not reset),
// and the groups use INSERT IGNORE. Both accounts are stored as bcrypt hashes, so the plaintext in
// .env is the only copy of those passwords. Password length is checked before the transaction opens.
import 'dotenv/config';
import mysql from 'mysql2/promise';
import { hash } from 'bcryptjs';
const sql = await mysql.createConnection(process.env.DATABASE_URL);
try {
  for (const name of ['ADMIN_PASSWORD', 'STAFF_PASSWORD']) {
    const value = process.env[name] || '';
    if (value.length < 12 || Buffer.byteLength(value) > 72)
      throw new Error(`${name} must be 12–72 UTF-8 bytes. Run npm run configure.`);
  }
  await sql.beginTransaction();
  const [[{ n }]] = await sql.query('SELECT count(*) n FROM staff');
  if (n === 0) {
    const passwords = await Promise.all([hash(process.env.ADMIN_PASSWORD, 12), hash(process.env.STAFF_PASSWORD, 12)]);
    await sql.execute(`INSERT INTO staff(name,email,username,password_hash,role) VALUES
      ('Administrator','admin@example.invalid','admin',?,'ADMIN'),
      ('Staff account','staff@example.invalid','staff',?,'STAFF')`, passwords);
    console.log('Created admin/staff accounts. Only bcrypt hashes are stored in MySQL.');
  } else console.log('Existing accounts preserved. Passwords were not reset.');
  await sql.query("INSERT IGNORE INTO blood_group(group_name) VALUES('A+'),('A-'),('B+'),('B-'),('AB+'),('AB-'),('O+'),('O-')");
  await sql.commit();
  console.log('Blood groups ready. Create hospitals/storage in the Admin section, then enter your own project records.');
} catch (error) {
  await sql.rollback();
  throw error;
} finally { await sql.end(); }
