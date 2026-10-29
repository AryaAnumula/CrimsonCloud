import { MongoClient } from 'mongodb';
const globalMongo = globalThis as unknown as { bbmsMongo?: Promise<MongoClient> };
// Returns the MongoDB database handle, connecting on first use and reusing the client afterwards
// (including across dev hot-reloads). The connection is cached as a promise so concurrent requests
// share one client, the cache is cleared when connecting fails so a later request can retry, and
// every timeout is short so an unreachable server answers quickly instead of hanging the request.
export async function mongo() {
  if (!process.env.MONGODB_URI) throw new Error('MongoDB is not configured');
  if (!globalMongo.bbmsMongo) {
    globalMongo.bbmsMongo = new MongoClient(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 4000, connectTimeoutMS: 4000, socketTimeoutMS: 5000, timeoutMS: 8000,
    }).connect().catch(error => { globalMongo.bbmsMongo = undefined; throw error; });
  }
  return (await globalMongo.bbmsMongo).db(process.env.MONGODB_DB || 'blood_bank');
}
