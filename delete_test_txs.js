import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';

admin.initializeApp({ projectId: 'juristpro' });
let databaseId = '(default)';
try {
  const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
  if (config.firestoreDatabaseId) databaseId = config.firestoreDatabaseId;
} catch (e) {}

const db = getFirestore(admin.app(), databaseId);

async function run() {
  const txs = await db.collection('transactions').get();
  
  let deletedCount = 0;
  for (const doc of txs.docs) {
    const data = doc.data();
    // Keep transactions from today (or yesterday if timezone difference)
    // The user said "achizitia mea de azi"
    if (!data.created_at || !data.created_at.startsWith('2026-04-11')) {
      console.log('Deleting test transaction:', doc.id, data);
      await db.collection('transactions').doc(doc.id).delete();
      deletedCount++;
    } else {
      console.log('Keeping transaction:', doc.id, data);
    }
  }
  console.log(`Deleted ${deletedCount} test transactions.`);
}
run().catch(console.error);
