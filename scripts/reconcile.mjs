// Task: cross-database consistency report. Read-only; it never deletes or rewrites screening history.
// MySQL cannot roll back a MongoDB write, so this script lists the three ways the two stores can
// drift apart: a donation pointing at a missing questionnaire, a questionnaire no donation claims,
// and a storage occupancy counter that disagrees with the units actually retained.
import 'dotenv/config';
import mysql from 'mysql2/promise';
import { MongoClient } from 'mongodb';
const sql=await mysql.createConnection(process.env.DATABASE_URL);
const mongo=new MongoClient(process.env.MONGODB_URI,{serverSelectionTimeoutMS:5000});
try{
 await mongo.connect();
 const [donations]=await sql.query('SELECT donation_id,screening_ref FROM donation');
 const docs=await mongo.db(process.env.MONGODB_DB||'blood_bank').collection('screening_submissions').find({}, {projection:{_id:0,donation_id:1,submission_id:1}}).toArray();
 const refs=new Map(donations.map(d=>[d.donation_id,d.screening_ref]));
 const documents=new Set(docs.map(d=>d.submission_id));
 const [storage]=await sql.query(`SELECT s.storage_id,s.occupied_units,
   (SELECT count(*) FROM blood_unit u WHERE u.storage_id=s.storage_id AND u.status IN ('QUARANTINED','AVAILABLE')) AS actual_units
   FROM storage s HAVING occupied_units<>actual_units`);
 console.log(JSON.stringify({sql_references_missing_document:donations.filter(d=>d.screening_ref&&!documents.has(d.screening_ref)).map(d=>({donation_id:d.donation_id,submission_id:d.screening_ref})),
   documents_not_linked_by_sql:docs.filter(d=>refs.get(d.donation_id)!==d.submission_id),storage_mismatches:storage},null,2));
}finally{await sql.end();await mongo.close();}
