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
  const profiles = await db.collection('profiles').get();
  
  for (const doc of profiles.docs) {
    const data = doc.data();
    if (data.full_name === 'cata san') {
      console.log('Found user:', doc.id, data);
      await db.collection('profiles').doc(doc.id).update({
        credits: data.credits + 40 // Assuming they bought the 40 credits pack
      });
      console.log('Added 40 credits to user.');
    }
  }
}
run().catch(console.error);
