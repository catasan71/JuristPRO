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
    if (data.email === 'catalinsandu07@gmail.com') {
      console.log('User:', data.full_name, 'Credits:', data.credits, 'Role:', data.role);
    }
  }
}
run().catch(console.error);
