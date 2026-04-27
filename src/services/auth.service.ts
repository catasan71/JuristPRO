import { Injectable, signal, computed, effect, inject } from '@angular/core';
import { auth, db } from '../app/firebase';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  User as FirebaseUser,
  GoogleAuthProvider,
  signInWithPopup,
  sendPasswordResetEmail
} from 'firebase/auth';
import { doc, setDoc, updateDoc, collection, getDocs, deleteDoc, onSnapshot, getDoc } from 'firebase/firestore';
import { NotificationService } from './notification.service';

export type UserRole = 'admin' | 'lawyer';
export type SubscriptionStatus = 'active' | 'pending_payment' | 'expired' | 'trial' | 'cancelled';

export interface UserConsents {
  terms: boolean;
  gdpr: boolean;
  marketing: boolean;
  tracking: boolean;
}

export interface AppUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  plan: 'trial' | 'expert' | 'gold';
  status: SubscriptionStatus;
  credits: number;
  consents?: UserConsents;
  billing_data?: Record<string, unknown>;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  // State
  private _currentUser = signal<AppUser | null>(null);
  private _loading = signal<boolean>(true);
  private notificationService = inject(NotificationService);
  
  // Admin State
  private _allUsers = signal<AppUser[]>([]);

  currentUser = this._currentUser.asReadonly();
  isLoading = this._loading.asReadonly();
  allUsers = this._allUsers.asReadonly();
  
  isAdmin = computed(() => {
    const user = this._currentUser();
    if (!user || !user.email) return false;
    const email = user.email.toLowerCase();
    return user.role === 'admin' || 
           email === 'catalinsandu07@gmail.com' || 
           email === 'admin@juristpro.ai';
  });
  
  isAuthenticated = computed(() => !!this._currentUser());
  
  isDemo = computed(() => {
    const user = this._currentUser();
    if (!user) return false;
    return user.id.startsWith('demo-') || user.id.startsWith('bypass-') || user.id.startsWith('admin-demo');
  });

  isRealUser = computed(() => {
    return this.isAuthenticated() && !this.isDemo();
  });

  constructor() {
    this.initSession();
    
    effect(() => {
        if (this.isAdmin()) {
            this.fetchAllUsers();
        }
    });
  }

  async initSession() {
    this._loading.set(true);

    onAuthStateChanged(auth, async (user: FirebaseUser | null) => {
      const current = this._currentUser();
      const isLocalSession = current && (current.id.startsWith('demo-') || current.id.startsWith('bypass-') || current.id.startsWith('admin-demo'));

      if (isLocalSession && !user) {
          this._loading.set(false);
          return;
      }

      if (user) {
        await this.fetchProfile(user.uid, user.email || '');
      } else {
        if (!isLocalSession) {
           this._currentUser.set(null);
        }
      }
      this._loading.set(false);
    }, (error) => {
      console.error('Auth State Change Error:', error);
      this.notificationService.error('Eroare la verificarea sesiunii.');
    });
  }

  // --- REAL-TIME UPDATE METHODS ---
  updateUserCredits(newAmount: number) {
    this._currentUser.update(user => {
      if (!user) return null;
      return { ...user, credits: newAmount };
    });
  }

  updateUserConsents(newConsents: UserConsents) {
    this._currentUser.update(user => {
        if (!user) return null;
        return { ...user, consents: newConsents };
    });
  }

  async updateBillingData(userId: string, billingData: Record<string, unknown>) {
    try {
      const docRef = doc(db, 'profiles', userId);
      await updateDoc(docRef, { billing_data: billingData });
      this.notificationService.success('Datele de facturare au fost salvate.');
      return { error: null };
    } catch (error: unknown) {
      console.error("Error updating billing data:", error);
      const msg = error instanceof Error ? error.message : String(error);
      this.notificationService.error(`Eroare la salvarea datelor: ${msg}`);
      return { error: msg };
    }
  }

  async login(email: string, pass: string): Promise<{ error: string | null }> {
    try {
      await signInWithEmailAndPassword(auth, email, pass);
      this.notificationService.success('Autentificare reușită!');
      return { error: null };
    } catch (error: unknown) {
      const err = error as { message?: string };
      const msg = err.message || 'Eroare la autentificare.';
      this.notificationService.error(msg);
      return { error: msg };
    }
  }

  async resetPassword(email: string): Promise<{ error: string | null }> {
    try {
      await sendPasswordResetEmail(auth, email);
      this.notificationService.info('Email-ul de resetare a fost trimis.');
      return { error: null };
    } catch (error: unknown) {
      const err = error as { message?: string };
      const msg = err.message || 'Eroare la trimiterea emailului.';
      this.notificationService.error(msg);
      return { error: msg };
    }
  }

  private _pendingRegistrationData: { plan: string, consents: UserConsents } | null = null;

  async loginWithGoogle(plan?: string, consents?: UserConsents): Promise<{ error: string | null }> {
    try {
      if (plan && consents) {
        this._pendingRegistrationData = { plan, consents };
      }
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      this.notificationService.success('Conectat cu Google!');
      return { error: null };
    } catch (error: unknown) {
      const err = error as { message?: string, code?: string };
      let msg = 'Eroare la autentificare cu Google.';
      if (err.code === 'auth/popup-closed-by-user') {
        msg = 'Fereastra de autentificare Google a fost închisă. Te rugăm să încerci din nou.';
      } else if (err.code === 'auth/too-many-requests') {
        msg = 'Prea multe încercări. Te rugăm să aștepți câteva minute.';
      }
      this.notificationService.error(msg);
      return { error: msg };
    }
  }

  async loginAsDemo() {
    this._loading.set(true);
    await new Promise(resolve => setTimeout(resolve, 800));

    const demoUser: AppUser = {
      id: 'demo-user-id',
      email: 'demo@juristpro.ai',
      fullName: 'Avocat Vizitator (Demo)',
      role: 'lawyer',
      plan: 'expert',
      status: 'active',
      credits: 100,
      consents: { terms: true, gdpr: true, marketing: false, tracking: false }
    };
    
    this._currentUser.set(demoUser);
    this.notificationService.info('Accesat în mod Demo.');
    this._loading.set(false);
  }

  async loginAsAdminDemo() {
    this._loading.set(true);
    await new Promise(resolve => setTimeout(resolve, 800));

    const adminUser: AppUser = {
      id: 'admin-demo-id',
      email: 'admin@juristpro.ai',
      fullName: 'Administrator Sistem',
      role: 'admin',
      plan: 'gold',
      status: 'active',
      credits: 9999,
      consents: { terms: true, gdpr: true, marketing: false, tracking: false }
    };
    
    this._currentUser.set(adminUser);
    this.notificationService.info('Accesat în mod Admin Demo.');
    
    if (this._allUsers().length === 0) {
        this._allUsers.set([
            { id: 'u1', email: 'avocat1@law.ro', fullName: 'Av. Popescu Ion', role: 'lawyer', plan: 'expert', status: 'active', credits: 45, consents: { terms: true, gdpr: true, marketing: true, tracking: true } },
            { id: 'u2', email: 'office@legal.com', fullName: 'SC Legal Solutions', role: 'lawyer', plan: 'gold', status: 'active', credits: 410, consents: { terms: true, gdpr: true, marketing: false, tracking: true } },
            { id: 'u3', email: 'test@student.ro', fullName: 'Student Drept', role: 'lawyer', plan: 'trial', status: 'expired', credits: 0, consents: { terms: true, gdpr: true, marketing: true, tracking: false } },
            { id: 'u4', email: 'demo@juristpro.ai', fullName: 'Avocat Vizitator', role: 'lawyer', plan: 'expert', status: 'active', credits: 100, consents: { terms: true, gdpr: true, marketing: false, tracking: false } }
        ]);
    }

    this._loading.set(false);
  }

  async register(email: string, pass: string, fullName: string, plan: string, consents: UserConsents): Promise<{ error: string | null; warning?: string }> {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
      const user = userCredential.user;
      
      const initialCredits = plan === 'trial' ? 5 : 0;
      
      const initialCabinetData = {
        lawyerName: fullName,
        name: '',
        barId: '',
        cif: '',
        address: '',
        phone: '',
        email: email
      };

      const profileData = {
        id: user.uid,
        email: email,
        full_name: fullName,
        role: 'lawyer',
        plan: plan,
        status: plan === 'trial' ? 'trial' : 'pending_payment',
        credits: initialCredits,
        cabinet_data: initialCabinetData,
        consents: consents,
        created_at: new Date().toISOString()
      };

      await setDoc(doc(db, 'profiles', user.uid), profileData);
      this.notificationService.success('Cont creat cu succes!');
      return { error: null };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn("Registration Error:", errorMessage);
      
      const isRateLimit = errorMessage.includes('too-many-requests') || errorMessage.includes('network-request-failed');
      
      if (isRateLimit) {
          console.warn(">>> ACTIVATING RATE LIMIT BYPASS MODE <<<");
          
          const bypassUser: AppUser = {
              id: 'bypass-' + Date.now(), 
              email: email,
              fullName: fullName,
              role: 'lawyer',
              plan: plan as 'trial' | 'expert' | 'gold',
              status: plan === 'trial' ? 'trial' : 'pending_payment',
              credits: plan === 'trial' ? 5 : 0,
              consents: consents
          };

          this._currentUser.set(bypassUser);
          this.notificationService.warning('Acces limitat activat din cauza traficului intens.');
          
          return { 
              error: null, 
              warning: "Notă: Serverul este aglomerat, dar am creat un cont local temporar pentru a vă permite accesul imediat." 
          };
      }

      this.notificationService.error(errorMessage);
      return { error: errorMessage };
    }
  }

  async logout() {
    try {
      if (this.profileUnsubscribe) {
        this.profileUnsubscribe();
        this.profileUnsubscribe = null;
      }
      await signOut(auth);
      this._currentUser.set(null);
      this._allUsers.set([]);
      this.notificationService.info('V-ați deconectat.');
    } catch (error) {
      console.error('Logout error:', error);
      this.notificationService.error('Eroare la deconectare.');
    }
  }

  async refreshSession() {
    const user = auth.currentUser;
    if (user) {
      await this.fetchProfile(user.uid, user.email || '');
    }
  }

  private profileUnsubscribe: (() => void) | null = null;

  private async fetchProfile(userId: string, email: string) {
    try {
      if (this.profileUnsubscribe) {
        this.profileUnsubscribe();
      }

      const docRef = doc(db, 'profiles', userId);
      
      this.profileUnsubscribe = onSnapshot(docRef, (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          this._currentUser.set({
            id: userId,
            email: email,
            fullName: data['full_name'],
            role: data['role'] || 'lawyer',
            plan: data['plan'],
            status: data['status'],
            credits: data['credits'],
            consents: data['consents'],
            billing_data: data['billing_data']
          });
        } else {
          // If profile doesn't exist but auth does, create a basic profile
          const plan = this._pendingRegistrationData?.plan || 'trial';
          const consents = this._pendingRegistrationData?.consents || { terms: true, gdpr: true, marketing: false, tracking: true };
          const credits = plan === 'trial' ? 5 : 0;
          const status = plan === 'trial' ? 'trial' : 'pending_payment';

          const isAdminEmail = email.toLowerCase() === 'catalinsandu07@gmail.com' || email.toLowerCase() === 'admin@juristpro.ai';
          const role = isAdminEmail ? 'admin' : 'lawyer';
          
          const newProfile = {
            id: userId,
            email: email,
            full_name: email.split('@')[0],
            role: role,
            plan: plan,
            status: status,
            credits: credits,
            consents: consents,
            created_at: new Date().toISOString()
          };
          
          this._pendingRegistrationData = null; // clear it

          setDoc(docRef, newProfile).then(() => {
            this._currentUser.set({
              id: userId,
              email: email,
              fullName: newProfile.full_name,
              role: role as UserRole,
              plan: plan as 'trial' | 'expert' | 'gold',
              status: status as SubscriptionStatus,
              credits: credits,
              consents: consents
            });
          });
        }
      }, (error) => {
        console.error("Error fetching profile:", error);
      });
    } catch (error) {
      console.error("Error setting up profile listener:", error);
    }
  }
  
  // Admin Method
  async fetchAllUsers() {
      try {
        const querySnapshot = await getDocs(collection(db, 'profiles'));
        const users: AppUser[] = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          users.push({
            id: doc.id,
            email: data['email'] || 'hidden@user.com',
            fullName: data['full_name'],
            role: data['role'] || 'lawyer',
            plan: data['plan'],
            status: data['status'],
            credits: data['credits'],
            consents: data['consents']
          });
        });
        this._allUsers.set(users);
      } catch (error) {
        console.error("Error fetching all users:", error);
      }
  }

  async deleteUser(id: string) {
      try {
        await deleteDoc(doc(db, 'profiles', id));
        this._allUsers.update(u => u.filter(user => user.id !== id));
        this.notificationService.success('Utilizator șters.');
      } catch (error) {
        console.error("Error deleting user:", error);
        this.notificationService.error('Eroare la ștergerea utilizatorului.');
      }
  }

  async addCreditsToUser(id: string, amount: number) {
    // Quick local update for bypass/demo users
    if (id.startsWith('demo') || id.startsWith('bypass') || id.startsWith('admin')) {
      this._currentUser.update(u => u ? ({ ...u, credits: (u.credits || 0) + amount }) : null);
      this.notificationService.success(`S-au adăugat ${amount} credite.`);
      return;
    }

    try {
      const userRef = doc(db, 'profiles', id);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const currentCredits = userSnap.data()['credits'] || 0;
        await updateDoc(userRef, { credits: currentCredits + amount });
        this.notificationService.success(`S-au adăugat ${amount} credite.`);
      }
    } catch (error) {
      console.error("Error adding credits:", error);
      this.notificationService.error('Eroare la adăugarea creditelor.');
    }
  }

  async activateSubscription() {
    const user = this._currentUser();
    if (!user) return;

    if (user.id.startsWith('demo') || user.id.startsWith('bypass') || user.id.startsWith('admin')) {
        this._currentUser.update(u => u ? ({...u, status: 'active', plan: 'expert', credits: 150}) : null);
        this.notificationService.success('Abonament activat (Mod Demo).');
        return; 
    }

    try {
      await updateDoc(doc(db, 'profiles', user.id), { status: 'active' });
      await this.fetchProfile(user.id, user.email);
      this.notificationService.success('Abonament activat cu succes!');
    } catch (error) {
      console.error("Error activating subscription:", error);
      this.notificationService.error('Eroare la activarea abonamentului.');
    }
  }
}
