import { randomBytes } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
if (existsSync('.env')) {
  console.log('.env already exists; it was not changed.');
} else {
  const admin = randomBytes(12).toString('hex');
  const staff = randomBytes(12).toString('hex');
  writeFileSync('.env', `# Local DBMS mini-project. Do not commit this file.\nDATABASE_URL=mysql://root:YOUR_MYSQL_PASSWORD@127.0.0.1:3306/blood_bank\nMONGODB_URI=mongodb://127.0.0.1:27017\nMONGODB_DB=blood_bank\nADMIN_PASSWORD=${admin}\nSTAFF_PASSWORD=${staff}\nAPP_ORIGIN=http://localhost:3000\nCOOKIE_SECURE=false\n`, { mode: 0o600 });
  console.log('Created .env. Edit DATABASE_URL to use your own local MySQL login.');
  console.log('Initial admin password:', admin);
  console.log('Initial staff password:', staff);
}
