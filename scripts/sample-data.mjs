// Optional: insert fictional records for exploring queries. Not required to use the app.
import 'dotenv/config';
import mysql from 'mysql2/promise';
import { MongoClient } from 'mongodb';
import { randomUUID, createHash } from 'node:crypto';
const sql = await mysql.createConnection({uri:process.env.DATABASE_URL,timezone:'Z',decimalNumbers:true});
const mongo = new MongoClient(process.env.MONGODB_URI);
try {
  await sql.query("SET time_zone = '+00:00'");
  await mongo.connect();
  const [[{n}]] = await sql.query('SELECT count(*) n FROM donor');
  if (n) throw new Error('Sample insertion requires an empty donor register. Your existing records were not changed.');
  const [[actor]] = await sql.query("SELECT staff_id FROM staff WHERE username='admin'");
  if (!actor) throw new Error('Run npm run db:seed first');
  const [groups] = await sql.query('SELECT * FROM blood_group ORDER BY blood_group_id');
  await sql.beginTransaction();
  await sql.query('SET @app_staff_id = ?', [actor.staff_id]);
  await sql.query(`INSERT INTO storage(location_name,storage_type,temperature_c,capacity_units) VALUES
    ('Sample Store A','REFRIGERATOR',4,100),('Sample Store B','REFRIGERATOR',4,100)`);
  const [[store]] = await sql.query("SELECT storage_id FROM storage WHERE location_name='Sample Store A'");
  await sql.query(`INSERT INTO hospital(hospital_name,location,phone,email) VALUES
    ('Sample Hospital North','Fictional North Campus','0000000001','north@example.invalid'),
    ('Sample Hospital South','Fictional South Campus','0000000002','south@example.invalid')`);
  for(const group of groups)for(let i=0;i<3;i++){
    const number=group.blood_group_id*10+i;
    const [donor]=await sql.execute(`INSERT INTO donor(name,dob,gender,weight_kg,phone,email,address,blood_group_id)
      VALUES(?,'1998-04-15','Not specified',65,?,?,'Synthetic demo address',?)`,[`Sample Donor ${number}`,`DEMO-${number}`,`donor${number}@example.invalid`,group.blood_group_id]);
    const [donation]=await sql.execute(`INSERT INTO donation(donor_id,quantity_ml,collected_by,collected_at)
      VALUES(?,450,?,DATE_SUB(CURRENT_TIMESTAMP(3),INTERVAL 1 DAY))`,[donor.insertId,actor.staff_id]);
    const [unit]=await sql.execute(`INSERT INTO blood_unit(donation_id,blood_group_id,storage_id,volume_ml,expires_at)
      VALUES(?,?,?,450,TIMESTAMPADD(DAY,?,CURRENT_TIMESTAMP(3)))`,[donation.insertId,group.blood_group_id,store.storage_id,i===0?3:12]);
    if(i<2){
      const submission=randomUUID(),answers={identity_confirmed:true,consent_recorded:true,review_note:'Synthetic classroom fixture, not a medical approval.'};
      const payload={donation_id:donation.insertId,form_version:'v1',decision:'APPROVED',answers};
      await mongo.db(process.env.MONGODB_DB||'blood_bank').collection('screening_submissions').insertOne({...payload,submission_id:submission,payload_hash:createHash('sha256').update(JSON.stringify(payload)).digest('hex'),submitted_by:actor.staff_id,submitted_at:new Date()});
      await sql.execute("UPDATE donation SET screening_status='APPROVED',screening_ref=? WHERE donation_id=?",[submission,donation.insertId]);
      await sql.execute("INSERT INTO blood_test(unit_id,tested_by,test_type,result) VALUES(?,?,'SCREENING_PANEL','PASS')",[unit.insertId,actor.staff_id]);
      await sql.execute("UPDATE blood_unit SET status='AVAILABLE' WHERE unit_id=?",[unit.insertId]);
    }
  }
  const [[hospital]]=await sql.query('SELECT hospital_id FROM hospital ORDER BY hospital_id LIMIT 1');
  const ogroup=groups.find(g=>g.group_name==='O+');
  await sql.execute(`INSERT INTO blood_request(hospital_id,blood_group_id,requested_units,priority,required_at)
    VALUES(?,?,2,'URGENT',DATE_ADD(CURRENT_TIMESTAMP(3),INTERVAL 2 DAY))`,[hospital.hospital_id,ogroup.blood_group_id]);

  await sql.commit();
  console.log('Optional sample data added: 24 fictional donors/units, 16 released, 8 quarantined.');
} catch (error) {
  await sql.rollback();
  throw error;
} finally {
  await sql.end();
  await mongo.close();
}
