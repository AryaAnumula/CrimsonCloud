import { NextRequest } from 'next/server';
import { createHash } from 'node:crypto';
import { transaction } from '@/lib/db';
import { mongo } from '@/lib/mongo';
import { Actor, HttpError } from '@/lib/auth';
import { body, ok, missing } from '@/lib/http';
import * as v from '@/lib/validation';

// Task: donations and their screening, in one handler because the screening step is keyed by donation.
//   POST /api/donations                — insert the donation and its blood unit in ONE transaction,
//                                        so a collection can never be recorded without a traceable bag.
//   POST /api/donations/:id/screening  — the cross-database case: write the questionnaire document
//                                        to MongoDB, then finalise the decision in MySQL.
// The document is written first; replaying the same submission key with the same answers finishes a
// partial failure without duplicating it, and different answers under an old key are rejected.
// MySQL cannot roll back MongoDB, so scripts/reconcile.mjs reports any orphaned links.
export async function donationsTask(req: NextRequest, actor: Actor, rawId?: string, action = '') {
  const key = rawId ? v.id.parse(rawId) : 0;
  const data = req.method === 'DELETE' ? {} : await body(req);
  const result = await transaction(actor.staff_id, async db => {
    if (!key) {
      const d = v.donationInput.parse(data);
      if (new Date(d.expires_at).getTime() <= Date.now()) throw new HttpError(400, 'Choose a future expiry for this collection');
      const inserted = await db.query(`INSERT INTO donation (donor_id,quantity_ml,collected_by) VALUES (?,?,?) `, [d.donor_id,d.quantity_ml,actor.staff_id]);
      const donationId = inserted.insertId;
      const unit = await db.query(`INSERT INTO blood_unit (donation_id,blood_group_id,storage_id,volume_ml,expires_at)
        SELECT ?,blood_group_id,?,?,? FROM donor WHERE donor_id = ? `, [donationId,d.storage_id,d.quantity_ml,new Date(d.expires_at),d.donor_id]);
      return { donation_id: donationId, unit_id: unit.insertId };
    }
    if (action === 'screening') {
      const d = v.screeningInput.parse(data);
      const row = (await db.query('SELECT * FROM donation WHERE donation_id = ? FOR UPDATE', [key])).rows[0];
      if (!row) return missing();
      if (row.screening_status !== 'PENDING' && row.screening_ref !== d.submission_id) throw new HttpError(409, 'Screening has already been finalized');
      const contentHash = createHash('sha256').update(JSON.stringify({ donation_id: key, form_version: d.form_version, decision: d.decision, answers: d.answers })).digest('hex');
      const store = (await mongo()).collection('screening_submissions');
      // Task: Preserve the MongoDB questionnaire; retry the same payload/key if SQL fails.
      // MySQL and MongoDB do not share one transaction. db:reconcile checks orphan links.
      await store.updateOne({ submission_id: d.submission_id }, { $setOnInsert: {
        submission_id: d.submission_id, donation_id: key, form_version: d.form_version,
        decision: d.decision, answers: d.answers, payload_hash: contentHash,
        submitted_by: actor.staff_id, submitted_at: new Date(),
      } }, { upsert: true });
      const stored = await store.findOne({ submission_id: d.submission_id });
      if (stored?.payload_hash !== contentHash) throw new HttpError(409, 'Submission key already has different answers');
      if (row.screening_status !== 'PENDING') {
        if (row.screening_ref === d.submission_id && row.screening_status === d.decision) return { message: 'Screening already saved' };
        throw new HttpError(409, 'Screening has already been finalized');
      }
      await db.query('UPDATE donation SET screening_status = ?, screening_ref = ? WHERE donation_id = ?', [d.decision,d.submission_id,key]);
      return { message: 'Questionnaire saved and screening finalized' };
    }
    return missing();
  });
  return ok(result);
}
