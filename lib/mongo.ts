import { MongoClient } from 'mongodb';
const globalMongo = globalThis as unknown as { bbmsMongo?: Promise<MongoClient> };
export async function mongo() {
  if (!process.env.MONGODB_URI) throw new Error('MongoDB is not configured');
  if (!globalMongo.bbmsMongo) {
    globalMongo.bbmsMongo = new MongoClient(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 4000, connectTimeoutMS: 4000, socketTimeoutMS: 5000, timeoutMS: 8000,
    }).connect().catch(error => { globalMongo.bbmsMongo = undefined; throw error; });
  }
  return (await globalMongo.bbmsMongo).db(process.env.MONGODB_DB || 'blood_bank');
}
