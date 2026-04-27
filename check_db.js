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

async function check() {
  const txs = await db.collection('transactions').get();
  console.log('--- TRANSACTIONS ---');
  txs.forEach(doc => console.log(doc.id, doc.data()));
  
  const profiles = await db.collection('profiles').get();
  console.log('--- PROFILES ---');
  profiles.forEach(doc => console.log(doc.id, doc.data().email, doc.data().credits));
}
check().catch(console.error);
