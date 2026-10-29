import 'dotenv/config';
import mysql from 'mysql2/promise';
import { writeFile } from 'node:fs/promises';
const sql=await mysql.createConnection(process.env.DATABASE_URL);
try{
 const [columns]=await sql.execute(`SELECT c.TABLE_NAME,c.COLUMN_NAME,c.COLUMN_TYPE,c.IS_NULLABLE,c.COLUMN_KEY,c.COLUMN_DEFAULT,c.EXTRA
   FROM information_schema.COLUMNS c JOIN information_schema.TABLES t
   ON t.TABLE_SCHEMA=c.TABLE_SCHEMA AND t.TABLE_NAME=c.TABLE_NAME
   WHERE c.TABLE_SCHEMA=DATABASE() AND t.TABLE_TYPE='BASE TABLE'
   ORDER BY c.TABLE_NAME,c.ORDINAL_POSITION`);
 const [links]=await sql.execute(`SELECT TABLE_NAME,COLUMN_NAME,REFERENCED_TABLE_NAME,REFERENCED_COLUMN_NAME
   FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL
   ORDER BY TABLE_NAME,COLUMN_NAME`);
 const groups=Object.groupBy(columns,c=>c.TABLE_NAME);
 let text='# MySQL data dictionary\n\nExported from the actual MySQL schema. PK/UNI/MUL are MySQL key indicators; MUL can be a foreign-key or non-unique index. See explicit foreign keys below. Nullable unique email columns allow multiple NULLs. DATETIME(3) values are UTC by application convention. ENUM definitions show every supported option.\n\n';
 for(const [table,cols] of Object.entries(groups)){
   text+=`## ${table}\n\n| Column | MySQL type | Nullable | Key | Default | Extra |\n| --- | --- | --- | --- | --- | --- |\n`;
   for(const c of cols)text+=`| ${c.COLUMN_NAME} | \`${c.COLUMN_TYPE}\` | ${c.IS_NULLABLE} | ${c.COLUMN_KEY||'—'} | ${c.COLUMN_DEFAULT??'—'} | ${c.EXTRA||'—'} |\n`;
   text+='\n';
 }
 text+='## Foreign keys\n\n| Foreign key | References |\n| --- | --- |\n';
 for(const k of links)text+=`| ${k.TABLE_NAME}.${k.COLUMN_NAME} | ${k.REFERENCED_TABLE_NAME}.${k.REFERENCED_COLUMN_NAME} |\n`;
 text+='\nOther constraints, indexes, views, triggers and the issuance procedure are defined in database/01_schema.sql and database/02_workflows.sql.\n';
 await writeFile(new URL('../docs/DATA_DICTIONARY.md',import.meta.url),text);console.log('Exported docs/DATA_DICTIONARY.md');
}finally{await sql.end();}
