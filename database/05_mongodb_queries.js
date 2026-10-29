// mongosh: select the database named by MONGODB_DB in .env (default: use blood_bank).
// These are read-only examples, also implemented by the Next.js report endpoint.
const database = db; // Use the currently selected database, including a custom demo name.
database.screening_submissions.find({}, { submission_id: 1, donation_id: 1, form_version: 1, decision: 1, submitted_at: 1 }).forEach(document => printjson(document));
database.screening_submissions.aggregate([
  { $group: {
    _id: { version: '$form_version', decision: '$decision' },
    submissions: { $sum: 1 },
    consent_recorded: { $sum: { $cond: ['$answers.consent_recorded', 1, 0] } },
  } },
  { $sort: { '_id.version': 1, '_id.decision': 1 } },
]).forEach(document => printjson(document));
printjson(database.screening_submissions.getIndexes());
// A questionnaire count is not an inventory or clinical-approval count.
