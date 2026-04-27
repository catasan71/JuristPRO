import { Injectable, signal, computed, inject, effect } from '@angular/core';
import { GoogleGenAI } from '@google/genai';
import { AuthService, UserConsents } from './auth.service';
import { db } from '../app/firebase';
import { doc, getDoc, updateDoc, setDoc, collection, getDocs, addDoc, query, where, orderBy, onSnapshot, deleteDoc } from 'firebase/firestore';
import { environment } from '../environments/environment';
import { NotificationService } from './notification.service';

export type ModuleType = 'landing' | 'auth' | 'payment' | 'admin-dashboard' | 'dashboard' | 'assistant' | 'strategy' | 'audit' | 'drafting' | 'fees' | 'calendar' | 'profile' | 'pricing' | 'guide';
export type PlanType = 'trial' | 'expert' | 'gold';

export interface ChatSource {
  title: string;
  url: string;
}

export interface ChatMessage {
  role: 'user' | 'ai';
  content: string;
  timestamp: Date;
  sources?: ChatSource[];
}

export interface SupportTicket {
  id: string;
  userId?: string;
  name: string;
  email: string;
  type: string;
  message: string;
  date: Date;
  status: 'open' | 'resolved' | 'in_progress' | 'closed';
  adminResponse?: string;
}

export interface FinancialTransaction {
  id: string;
  userId: string;
  userName: string;
  amount: number;
  currency: 'RON';
  type: 'subscription' | 'top-up';
  date: Date;
  status: 'completed' | 'failed';
  billingData?: Record<string, unknown>;
}

export interface CabinetProfile {
  name: string;
  lawyerName: string;
  barId: string;
  cif: string;
  address: string;
  phone: string;
  email: string;
}

export interface CalendarEvent {
  id: string;
  title: string; 
  clientName: string; 
  caseObject: string; 
  date: string;
  time: string; 
  type: 'court' | 'deadline' | 'meeting';
  details: string; 
  notes: string; 
  whatsappAlert: boolean;
  financial: {
    total: number;
    paid: number;
    rest: number;
  };
}

export interface SystemAnnouncement {
  active: boolean;
  message: string;
  type: 'info' | 'warning' | 'promo' | 'blackfriday';
  actionText?: string; 
  discountCode?: string;
}

export interface PromoCode {
  id: string;
  code: string;
  credits: number;
  maxUses: number;
  usedBy: string[];
  expiresAt: Date;
  active: boolean;
}

// --- STRICT LEGAL SYSTEM PROMPT ---
const LEGAL_GUARDRAILS = `
Ești JuristPRO, cel mai avansat asistent juridic AI specializat EXCLUSIV pe legislația din România actualizată la zi (2024-2025). 

REGULI CRITICE DE ACURATEȚE (IGNORAREA LOR ESTE INACCEPTABILĂ):

1. VERIFICARE OBLIGATORIE GOOGLE SEARCH:
   - Pentru orice întrebare care menționează articole din Codul Civil, Codul de Procedură Civilă, Codul Penal sau legi speciale, EȘTI OBLIGAT să efectuezi o căutare Google Search pentru a confirma versiunea actualizată.
   - ROMÂNIA 2024-2025: Legislația se schimbă rapid. Nu te baza pe memoria internă. Caută termenii: "[Lege/Articol] actualizat 2024" sau "Monitorul Oficial [An]".

2. ZERO TOLERANȚĂ PENTRU LEGI ABROGATE:
   - Identifică și declară explicit dacă un text de lege a fost abrogat (ex: Procedura filtrului la ICCJ - ABROGATĂ).
   - Dacă o lege a fost modificată, prezintă obligatoriu noua formă a textului.

3. CALITATEA ANALIZEI:
   - Nu oferi răspunsuri generice. Un avocat stagiar are nevoie de precizie chirurgicală.
   - Citează: LEGEA (nr./an), ARTICOLUL, ALINEATUL și TEZA (unde e cazul).
   - Dacă există divergențe în jurisprudență (ex: Decizii RIL sau HP ale ICCJ), menționează-le obligatoriu.

4. SURSE ȘI GROUNDING:
   - Folosește instrumentul Google Search Grounding în mod proactiv.
   - Afișează sursele (link-urile) la finalul răspunsului pentru a permite avocatului verificarea manuală.

Răspunsurile tale sunt folosite în LIVE de profesioniști. Orice eroare legislativă pune în pericol cazurile clienților noștri. Fii exhaustiv, precis și extrem de riguros.
`;

@Injectable({
  providedIn: 'root'
})
export class JuristService {
  authService = inject(AuthService);
  notificationService = inject(NotificationService);

  // --- API KEY FIX ---
  // Global State
  private _currentModule = signal<ModuleType>('landing'); 
  private _loading = signal<boolean>(false);
  
  // Data Signals
  private _profileData = signal<CabinetProfile>({
    name: '', lawyerName: '', barId: '', cif: '', address: '', phone: '', email: ''
  });
  private _events = signal<CalendarEvent[]>([]);
  private _tickets = signal<SupportTicket[]>([]);
  private _transactions = signal<FinancialTransaction[]>([]);

  // Announcement State
  private _announcement = signal<SystemAnnouncement>({
    active: false,
    message: '',
    type: 'info'
  });

  // Top Up Packages State
  private _topUpPackages = signal([
    { id: 'starter', name: 'Pachet Starter', price: 40, credits: 40 },
    { id: 'advanced', name: 'Pachet Advanced', price: 70, credits: 70 },
    { id: 'pro', name: 'Pachet Pro', price: 90, credits: 90 }
  ]);

  private _promoCodes = signal<PromoCode[]>([]);

  // Computed
  plan = computed(() => this.authService.currentUser()?.plan || 'trial');
  credits = computed(() => this.authService.currentUser()?.credits || 0);
  
  currentModule = this._currentModule.asReadonly();
  isLoading = this._loading.asReadonly();
  profile = this._profileData.asReadonly();
  events = this._events.asReadonly();
  tickets = this._tickets.asReadonly();
  transactions = this._transactions.asReadonly();
  announcement = this._announcement.asReadonly();
  topUpPackages = this._topUpPackages.asReadonly();

  totalRevenue = computed(() => this._transactions().reduce((acc, tx) => acc + tx.amount, 0));

  private _aiInstance: GoogleGenAI | null = null;

  private async getAiInstance(): Promise<GoogleGenAI> {
    if (this._aiInstance) return this._aiInstance;
    
    const apiKey = typeof GEMINI_API_KEY !== 'undefined' ? GEMINI_API_KEY : environment.geminiApiKey;
    
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY' || apiKey === '') {
      const msg = 'Cheia API Gemini nu este configurată corect. Te rugăm să verifici setările.';
      this.notificationService.error(msg);
      throw new Error(msg);
    }
    
    try {
      this._aiInstance = new GoogleGenAI({ apiKey });
      return this._aiInstance;
    } catch (error) {
      this.notificationService.error('Eroare la inițializarea motorului AI.');
      throw error;
    }
  }
  
  promoCodes = this._promoCodes.asReadonly();

  constructor() {
    // 1. Listen for global announcements (Always active, public)
    onSnapshot(doc(db, 'system_settings', 'announcement'), (docSnap) => {
      if (docSnap.exists()) {
        this._announcement.set(docSnap.data() as SystemAnnouncement);
      }
    }, (error) => {
      console.warn('Silent warning: Public announcement access status:', error.message);
    });

    // 2. Main data sync effect (Reactive to auth state)
    effect((onCleanup) => {
      const user = this.authService.currentUser();
      const isAdmin = this.authService.isAdmin();
      const isRealUser = this.authService.isRealUser();
      const isDemo = this.authService.isDemo();

      if (!user) {
        this.clearData();
        return;
      }

      if (isDemo) {
        this.loadLocalData(user.id);
        if (isAdmin) {
          this._promoCodes.set([
            { id: 'DEMO1', code: 'PROMO1', credits: 15, maxUses: 100, usedBy: [], expiresAt: new Date(), active: true },
            { id: 'DEMO2', code: 'BYPASS', credits: 50, maxUses: 10, usedBy: [], expiresAt: new Date(), active: true }
          ]);
        }
        return;
      }

      if (isRealUser) {
        // Load Profile Data (One-time or Snapshot)
        const profileUnsub = onSnapshot(doc(db, 'profiles', user.id), (snap) => {
          if (snap.exists()) {
            const data = snap.data();
            if (data['cabinet_data']) {
              this._profileData.set(data['cabinet_data'] as CabinetProfile);
            }
          }
        });

        // Load Tickets (Snapshot with cleanup)
        const ticketsQuery = isAdmin
          ? query(collection(db, 'tickets'), orderBy('created_at', 'desc'))
          : query(collection(db, 'tickets'), where('user_id', '==', user.id), orderBy('created_at', 'desc'));

        const ticketsUnsub = onSnapshot(ticketsQuery, (snap) => {
          this._tickets.set(snap.docs.map(doc => {
            const t = doc.data();
            return {
              id: doc.id,
              name: t['name'],
              email: t['email'],
              type: t['type'] as string,
              message: t['message'],
              date: new Date(t['created_at']),
              status: t['status'],
              adminResponse: t['admin_response']
            };
          }));
        }, (err) => console.warn('Tickets listener error:', err.message));

        // Load Promo Codes (Admin only, Snapshot with cleanup)
        let promoUnsub: (() => void) | null = null;
        if (isAdmin) {
          promoUnsub = onSnapshot(collection(db, 'promo_codes'), (snap) => {
            this._promoCodes.set(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as PromoCode)));
          }, (err) => {
            console.error('Error listening to promo codes:', err.message);
          });
        } else {
          this._promoCodes.set([]);
        }

        // Cleanup all listeners when user changes or service destroyed
        onCleanup(() => {
          profileUnsub();
          ticketsUnsub();
          if (promoUnsub) promoUnsub();
        });

        // Load initial one-time data (Events, Transactions)
        this.loadOneTimeData(user.id, isAdmin);
      }
    });
  }

  private async loadOneTimeData(userId: string, isAdmin: boolean) {
    try {
      // Events
      const eventsQuery = query(collection(db, 'events'), where('user_id', '==', userId), orderBy('event_date', 'asc'));
      const eventsSnap = await getDocs(eventsQuery);
      if (!eventsSnap.empty) {
        this._events.set(eventsSnap.docs.map(doc => {
          const e = doc.data();
          return {
            id: doc.id,
            title: e['title'],
            clientName: e['client_name'],
            caseObject: e['case_object'],
            date: e['event_date'],
            time: e['event_time'],
            type: e['type'] as 'court' | 'deadline' | 'meeting',
            details: e['details'],
            notes: e['notes'],
            whatsappAlert: e['whatsapp_alert'],
            financial: e['financial'] || { total: 0, paid: 0, rest: 0 }
          };
        }));
      }

      // Transactions
      const txQuery = isAdmin
        ? query(collection(db, 'transactions'), orderBy('created_at', 'desc'))
        : query(collection(db, 'transactions'), where('user_id', '==', userId), orderBy('created_at', 'desc'));
      const txSnap = await getDocs(txQuery);
      if (!txSnap.empty) {
        this._transactions.set(txSnap.docs.map(doc => {
          const t = doc.data();
          return {
            id: doc.id,
            userId: t['user_id'],
            userName: t['user_name'] || 'User',
            amount: t['amount'],
            currency: t['currency'] || 'RON',
            type: t['type'],
            date: new Date(t['created_at']),
            status: t['status'],
            billingData: t['billing_data']
          };
        }));
      }
    } catch (err) {
      console.warn('Initial data load warning:', err);
    }
  }

  private clearData() {
    this._events.set([]);
    this._tickets.set([]);
    this._transactions.set([]);
    this._profileData.set({ name: '', lawyerName: '', barId: '', cif: '', address: '', phone: '', email: '' });
  }

  setModule(module: ModuleType) {
    this._currentModule.set(module);
    if (typeof window !== 'undefined') {
      window.scrollTo(0, 0);
    }
  }
  
  async updateAnnouncement(data: SystemAnnouncement) {
    this._announcement.set(data);
    try {
      const cleanData = { ...data };
      if (cleanData.actionText === undefined) delete cleanData.actionText;
      if (cleanData.discountCode === undefined) delete cleanData.discountCode;
      
      await setDoc(doc(db, 'system_settings', 'announcement'), cleanData);
    } catch (error) {
      console.error('Error updating announcement in Firestore:', error);
    }
  }

  updateTopUpPackage(pack: { id: string, name: string, price: number, credits: number }) {
    this._topUpPackages.update(packages => 
      packages.map(p => p.id === pack.id ? { ...pack } : p)
    );
  }

  async createPromoCode(code: string, credits: number, maxUses: number) {
    try {
      await setDoc(doc(db, 'promo_codes', code.toUpperCase()), {
        code: code.toUpperCase(),
        credits,
        maxUses,
        usedBy: [],
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
        active: true
      });
      return { success: true };
    } catch (error) {
      console.error("Error creating promo code:", error);
      return { success: false, error: "Eroare la crearea codului." };
    }
  }

  async deletePromoCode(id: string) {
    try {
      await deleteDoc(doc(db, 'promo_codes', id));
      return { success: true };
    } catch (error) {
      console.error("Error deleting promo code:", error);
      return { success: false, error: "Eroare la ștergerea codului." };
    }
  }

  async redeemPromoCode(code: string): Promise<{ success: boolean; message: string }> {
    const user = this.authService.currentUser();
    if (!user) return { success: false, message: "Trebuie să fiți autentificat." };

    try {
      const codeRef = doc(db, 'promo_codes', code.toUpperCase());
      const codeSnap = await getDoc(codeRef);

      if (!codeSnap.exists()) {
        return { success: false, message: "Codul promoțional nu există sau este invalid." };
      }

      const promoData = codeSnap.data() as PromoCode;

      if (!promoData.active) {
        return { success: false, message: "Acest cod promoțional a fost dezactivat." };
      }

      if (promoData.expiresAt) {
         let isExpired = false;
         if (typeof (promoData.expiresAt as unknown as { toDate?: () => Date }).toDate === 'function') {
            isExpired = (promoData.expiresAt as unknown as { toDate: () => Date }).toDate() < new Date();
         } else {
            isExpired = new Date(promoData.expiresAt) < new Date();
         }
         if (isExpired) {
            return { success: false, message: "Acest cod promoțional a expirat." };
         }
      }

      if (promoData.usedBy && promoData.usedBy.includes(user.id)) {
        return { success: false, message: "Ați folosit deja acest cod promoțional." };
      }

      if (promoData.maxUses > 0 && promoData.usedBy && promoData.usedBy.length >= promoData.maxUses) {
        return { success: false, message: "Acest cod promoțional a atins limita maximă de utilizări." };
      }

      // Add credits to user
      await this.authService.addCreditsToUser(user.id, promoData.credits);

      // Add user to usedBy
      const updatedUsedBy = [...(promoData.usedBy || []), user.id];
      await updateDoc(codeRef, { usedBy: updatedUsedBy });

      return { success: true, message: `Cod aplicat cu succes! Ați primit ${promoData.credits} credite.` };
    } catch (error) {
      console.error("Error redeeming promo code:", error);
      return { success: false, message: "A apărut o eroare la aplicarea codului." };
    }
  }

  private loadLocalData(userId: string) {
    const user = this.authService.currentUser();
    
    this._profileData.set({
      name: user?.fullName ? `Cabinet "${user.fullName}"` : 'Cabinet Avocat',
      lawyerName: user?.fullName || 'Av. Demo',
      barId: 'Baroul București',
      cif: '',
      address: '',
      phone: '0712 345 678',
      email: user?.email || 'demo@juristpro.ai'
    });

    this._events.set([
      { id: 'demo1', title: 'Audierea Martorilor - Popescu vs ANAF', clientName: 'Popescu Ion', caseObject: 'Contestație Fiscală', date: new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0], time: '09:00', type: 'court', details: 'Curtea de Apel București', notes: 'Pregătire concluzii scrise', whatsappAlert: true, financial: { total: 5000, paid: 2500, rest: 2500 } },
      { id: 'demo2', title: 'Consultatie Draft Contract Vanzare', clientName: 'SC LEGAL SRL', caseObject: 'Consultanta Business', date: new Date(Date.now() + 86400000 * 3).toISOString().split('T')[0], time: '14:30', type: 'meeting', details: 'Zoom Meeting', notes: 'Revedere clauzele de penalizare', whatsappAlert: false, financial: { total: 1000, paid: 1000, rest: 0 } }
    ]);

    this._tickets.set([
      { id: 't1', name: 'Demo User', email: 'demo@juristpro.ai', type: 'Tehnic', message: 'Cum pot exporta calendarul?', date: new Date(), status: 'open' }
    ]);

    this._transactions.set([
      { id: 'tx1', userId: userId, userName: user?.fullName || 'Demo', amount: 90, currency: 'RON', type: 'subscription', date: new Date(), status: 'completed' }
    ]);
  }

  // --- CRUD ---

  async updateProfile(data: CabinetProfile, consents?: UserConsents) {
    const user = this.authService.currentUser();
    if (!user) return;

    this._profileData.set(data);
    if (consents) {
        this.authService.updateUserConsents(consents);
    }

    if (!this.authService.isDemo()) {
      const updates: Record<string, unknown> = { cabinet_data: data };
      if (consents) updates.consents = consents;
      await updateDoc(doc(db, 'profiles', user.id), updates);
    }
  }

  async addEvent(event: CalendarEvent) {
    const user = this.authService.currentUser();
    if (!user) return;

    if (this.authService.isDemo()) {
      const demoEvent = { ...event, id: 'local-' + Date.now() };
      this._events.update(e => [...e, demoEvent]);
      return;
    }

    const dbPayload = {
      user_id: user.id,
      title: event.title,
      client_name: event.clientName,
      case_object: event.caseObject,
      event_date: event.date,
      event_time: event.time,
      type: event.type,
      details: event.details,
      notes: event.notes,
      whatsapp_alert: event.whatsappAlert,
      financial: event.financial
    };

    const docRef = await addDoc(collection(db, 'events'), dbPayload);
    if (docRef.id) {
      const newEvent = { ...event, id: docRef.id };
      this._events.update(e => [...e, newEvent]);
    }
  }

  async updateEvent(updatedEvent: CalendarEvent) {
    const user = this.authService.currentUser();
    if (!user) return;

    this._events.update(events => events.map(e => e.id === updatedEvent.id ? updatedEvent : e));

    if (!this.authService.isDemo()) {
      const dbPayload = {
        title: updatedEvent.title,
        client_name: updatedEvent.clientName,
        case_object: updatedEvent.caseObject,
        event_date: updatedEvent.date,
        event_time: updatedEvent.time,
        type: updatedEvent.type,
        details: updatedEvent.details,
        notes: updatedEvent.notes,
        whatsapp_alert: updatedEvent.whatsappAlert,
        financial: updatedEvent.financial
      };
      await updateDoc(doc(db, 'events', updatedEvent.id), dbPayload);
    }
  }

  async submitTicket(ticket: Omit<SupportTicket, 'id' | 'date' | 'status'>) {
    const user = this.authService.currentUser();
    
    if (user && !this.authService.isDemo()) {
       const docRef = await addDoc(collection(db, 'tickets'), {
         user_id: user.id,
         name: ticket.name,
         email: ticket.email,
         type: ticket.type,
         message: ticket.message,
         status: 'open',
         created_at: new Date().toISOString()
       });
       
       if (docRef.id) {
          const newTicket: SupportTicket = { ...ticket, id: docRef.id, userId: user.id, date: new Date(), status: 'open' };
          this._tickets.update(t => [newTicket, ...t]);
       }
    } else {
       const newTicket: SupportTicket = { ...ticket, id: 'local-'+Date.now(), userId: user?.id, date: new Date(), status: 'open' };
       this._tickets.update(t => [newTicket, ...t]);
    }
  }

  async resolveTicket(id: string, response: string) {
    // Update local state
    this._tickets.update(tickets => tickets.map(t => t.id === id ? { ...t, status: 'resolved', adminResponse: response } : t));
    
    // Update Firestore
    try {
      await updateDoc(doc(db, 'tickets', id), {
        status: 'resolved',
        admin_response: response,
        resolved_at: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error updating ticket in Firestore:', error);
    }
  }

  async recordTransaction(amount: number, type: 'subscription' | 'top-up') {
    const user = this.authService.currentUser();
    if (!user) return;

    const tx: FinancialTransaction = {
      id: 'tx-' + Date.now(),
      userId: user.id,
      userName: user.fullName,
      amount: amount,
      currency: 'RON',
      type: type,
      date: new Date(),
      status: 'completed'
    };
    this._transactions.update(t => [tx, ...t]);

    if (!this.authService.isDemo()) {
       await addDoc(collection(db, 'transactions'), {
        user_id: user.id,
        amount: amount,
        type: type,
        status: 'completed',
        created_at: new Date().toISOString()
      });
    }
  }

  // --- SUB/CREDITS ---

  async upgradePlan(newPlan: PlanType) {
    const user = this.authService.currentUser();
    if (!user) return;

    this._loading.set(true);
    
    if (newPlan === 'trial') {
      if (!this.authService.isDemo()) {
        await updateDoc(doc(db, 'profiles', user.id), { plan: 'trial', status: 'active' });
      }
      console.log('Planul Trial a fost activat.');
      this._loading.set(false);
      return;
    }

    // If user already has an active paid subscription, redirect to portal to manage it
    if (user.status === 'active' && user.plan !== 'trial') {
      this.cancelSubscription(); // This opens the portal
      this._loading.set(false);
      return;
    }

    // Deschidem fereastra inainte de request pentru a evita blocarea de catre browser (popup blocker)
    const newWindow = window.open('', '_blank');

    try {
      const response = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'subscription',
          plan: newPlan,
          userId: user.id,
          email: user.email
        })
      });
      
      if (!response.ok) {
        throw new Error(`Server status: ${response.status}`);
      }

      const responseText = await response.text();
      let data;
      try {
        data = JSON.parse(responseText);
      } catch {
        if (newWindow) newWindow.close();
        console.error('Server returned non-JSON response:', responseText);
        this.notificationService.error('Eroare de la server. Vă rugăm contactați suportul.');
        this._loading.set(false);
        return { error: 'Eroare de la server. Vă rugăm contactați suportul.' };
      }

      if (data.url) {
        if (newWindow) {
           newWindow.location.href = data.url;
        } else {
           window.location.href = data.url;
        }
      } else {
        if (newWindow) newWindow.close();
        const errorMsg = data.error || 'Eroare la inițializarea plății';
        this.notificationService.error(errorMsg);
        this._loading.set(false);
        return { error: errorMsg };
      }
    } catch (error: unknown) {
      if (newWindow) newWindow.close();
      const err = error as { message?: string };
      console.error('Payment error:', err);
      this.notificationService.error('Eroare de conexiune la serverul de plăți.');
      this._loading.set(false);
      return { error: 'Eroare de conexiune la serverul de plăți' };
    }
    this._loading.set(false);
  }

  async cancelSubscription() {
    const user = this.authService.currentUser();
    if (!user) return false;

    this._loading.set(true);
    const newWindow = window.open('', '_blank');

    try {
      const response = await fetch('/api/create-portal-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id })
      });
      const data = await response.json();
      if (data.url) {
        if (newWindow) {
           newWindow.location.href = data.url;
        } else {
           window.location.href = data.url;
        }
        return true;
      } else {
        if (newWindow) newWindow.close();
        // Fallback to local cancellation if no Stripe customer ID exists
        if (!this.authService.isDemo()) {
           await updateDoc(doc(db, 'profiles', user.id), { status: 'cancelled' });
        }
        return true;
      }
    } catch (error) {
      if (newWindow) newWindow.close();
      console.error('Portal error:', error);
      return false;
    } finally {
      this._loading.set(false);
    }
  }

  async purchaseTopUp(amount: number) {
    const user = this.authService.currentUser();
    if (!user) return;

    // Find the package to get the credits amount
    const pkg = this.topUpPackages().find(p => p.price === amount);
    if (!pkg) return;

    this._loading.set(true);
    const newWindow = window.open('', '_blank');

    try {
      const response = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'topup',
          amount: amount,
          credits: pkg.credits,
          userId: user.id,
          email: user.email
        })
      });
      
      const responseText = await response.text();
      let data;
      try {
        data = JSON.parse(responseText);
      } catch {
        if (newWindow) newWindow.close();
        console.error('Server returned non-JSON response:', responseText);
        this._loading.set(false);
        return { error: 'Eroare de la server. Vă rugăm contactați suportul.' };
      }

      if (data.url) {
        if (newWindow) {
           newWindow.location.href = data.url;
        } else {
           window.location.href = data.url;
        }
      } else {
        if (newWindow) newWindow.close();
        console.error('Eroare la inițializarea plății: ' + (data.error || 'Unknown error'));
        this._loading.set(false);
        return { error: data.error || 'Eroare la inițializarea plății' };
      }
    } catch (error) {
      if (newWindow) newWindow.close();
      console.error('Payment error:', error);
      this._loading.set(false);
      return { error: 'Eroare de conexiune la serverul de plăți' };
    }
    this._loading.set(false);
  }

  private checkCredits(requiredAmount = 1): boolean {
    // Administratorul are acces nelimitat
    if (this.authService.isAdmin()) return true;
    
    if (this.credits() < requiredAmount) {
      console.warn(`Fonduri insuficiente! Necesită ${requiredAmount} credite.`);
      this.setModule('pricing');
      return false;
    }
    return true;
  }

  private async consumeCredit(amount = 1) {
    if (this.authService.isAdmin()) return; // Administratorul nu consumă credite
    
    const user = this.authService.currentUser();
    if (user) {
       const newBalance = Math.max(0, user.credits - amount);
       this.authService.updateUserCredits(newBalance);
       if (!this.authService.isDemo()) {
         await updateDoc(doc(db, 'profiles', user.id), { credits: newBalance });
       }
    }
  }
  
  // --- UTILS ---
  
  downloadDocx(contentHtml: string, titlePrompt: string) {
    const safeName = titlePrompt.trim().replace(/[^a-zA-Z0-9_ăâîșțĂÂÎȘȚ\- ]/g, '').split(' ').slice(0, 6).join('_');
    const filename = `JuristPRO_${safeName || 'Document'}.doc`;
    const cleanBody = contentHtml.replace(/\n/g, '<br/>').replace(/text-white/g, '').replace(/text-gray-\d+/g, '').replace(/bg-[\w-]+/g, ''); 

    const header = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>${safeName}</title></head><body>`;
    const sourceHTML = header + cleanBody + "</body></html>";
    const source = 'data:application/vnd.ms-word;charset=utf-8,' + encodeURIComponent(sourceHTML);
    const fileDownload = document.createElement("a");
    document.body.appendChild(fileDownload);
    fileDownload.href = source;
    fileDownload.download = filename;
    fileDownload.click();
    document.body.removeChild(fileDownload);
  }

  // --- AI FEATURES WITH SAFEGUARDS ---
  
  private async generateContentStreamWithFallback(
    ai: GoogleGenAI, 
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parameters: any, 
    primaryModel = 'gemini-flash-latest', 
    fallbackModel = 'gemini-3.1-pro-preview',
    timeoutMs = 30000
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> {
    const fetchWithTimeout = async (modelName: string) => {
      const responsePromise = ai.models.generateContentStream({
        ...parameters,
        model: modelName
      });
      
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('TIMEOUT_LATENCY')), timeoutMs)
      );
      
      return await Promise.race([responsePromise, timeoutPromise]);
    };

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await fetchWithTimeout(primaryModel) as any;
      return result;
    } catch (e: unknown) {
      console.warn(`Primary model ${primaryModel} failed or timed out, trying fallback ${fallbackModel} in 1s...`, e);
      // Wait 1 second before fallback to let rate limits or transient issues clear
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await fetchWithTimeout(fallbackModel) as any;
      return result;
    }
  }

  async chatWithAssistant(prompt: string, onChunk?: (chunk: string) => void): Promise<ChatMessage> {
    if (!this.checkCredits(3)) {
      return { role: 'ai', content: "Eroare: Credite insuficiente. Vă rugăm să vă reîncărcați contul.", timestamp: new Date() };
    }
    this._loading.set(true);
    let fullText = "";
    const extractedSources: ChatSource[] = [];
    try {
      const ai = await this.getAiInstance();
      
      // Folosim sistemul de fallback și pentru chat pentru stabilitate maximă
      const params = {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        tools: [{ googleSearch: {} }],
        config: { 
          systemInstruction: LEGAL_GUARDRAILS,
          temperature: 0.1,
          topP: 0.8,
          topK: 40,
        }
      };

      // Încercăm prima dată cu Gemini 2.0 Flash pentru viteză
      const responseStream = await this.generateContentStreamWithFallback(
        ai, 
        params, 
        'gemini-flash-latest', 
        'gemini-3.1-pro-preview',
        30000
      );

      for await (const chunk of responseStream) {
        const text = chunk.text;
        if (text) {
          fullText += text;
          if (onChunk) onChunk(fullText);
        }

        // Extract grounding sources
        const groundingMetadata = chunk.candidates?.[0]?.groundingMetadata;
        if (groundingMetadata && groundingMetadata.groundingChunks) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const chunksData = groundingMetadata.groundingChunks as any[];
          const newSources = chunksData
            .filter((c) => c.web && c.web.uri)
            .map((c) => ({ 
              title: c.web?.title || 'Sursă', 
              url: c.web?.uri as string 
            }));
            
          for (const src of newSources) {
            if (!extractedSources.some(s => s.url === src.url)) {
              extractedSources.push(src);
            }
          }
        }
      }
      
      await this.consumeCredit(3); 

      return { role: 'ai', content: fullText || "...", timestamp: new Date(), sources: extractedSources };
    } catch(e: unknown) { 
      console.error("AI Error:", e);
      let errorMessage: string;
      
      if (e instanceof Error) {
        errorMessage = e.message;
      } else if (typeof e === 'object' && e !== null) {
        errorMessage = JSON.stringify(e);
      } else {
        errorMessage = String(e);
      }
      
      if (errorMessage.includes('Incomplete JSON segment') || errorMessage.includes('TIMEOUT_CHUNK') || errorMessage.includes('TIMEOUT_LATENCY')) {
        if (fullText.length > 0) {
          return { role: 'ai', content: fullText, timestamp: new Date(), sources: extractedSources };
        }
      }
      
      this.notificationService.error(`Eroare AI: ${errorMessage}`);
      return { role: 'ai', content: `Eroare de comunicare cu inteligența artificială. Te rugăm să încerci din nou peste câteva momente.`, timestamp: new Date() }; 
    } 
    finally { this._loading.set(false); }
  }

  async generateStrategy(caseDetails: string, onChunk?: (chunk: string) => void): Promise<string> {
    if (!this.checkCredits(5)) return "Eroare: Credite insuficiente. Vă rugăm să vă reîncărcați contul.";
    this._loading.set(true);
    let fullText = "";
    try {
      const ai = await this.getAiInstance();
      const responseStream = await this.generateContentStreamWithFallback(ai, {
        contents: [{ role: 'user', parts: [{ text: `Analizează detaliat următoarea speță și elaborează o strategie juridică exhaustivă pentru avocat: ${caseDetails}. 
        
        STRUCTURA OBLIGATORIE A STRATEGIEI:
        1. REZUMATUL SITUAȚIEI DE FAPT ȘI DE DREPT: O sinteză clară a problemei juridice.
        2. ÎNCADRAREA JURIDICĂ ȘI TEMEIURI LEGALE: Identifică exact articolele de lege aplicabile (material și procedural). Explică de ce se aplică. Verifică validitatea lor prin Google Search.
        3. OPȚIUNI DE ACȚIUNE (CĂI DE ATAC / PROCEDURI): Prezintă toate variantele legale pe care le are clientul (ex: acțiune în instanță, plângere prealabilă, mediere, negociere).
        4. ARGUMENTE PRO ȘI CONTRA (SWOT JURIDIC): Punctele forte ale cazului nostru și posibilele apărări ale părții adverse.
        5. RISCURI PROCESUALE ȘI COSTURI ESTIMATE: Analizează șansele de câștig, riscul de a pierde, taxele de timbru posibile și durata estimată.
        6. PROBATORIUL NECESAR: Ce dovezi trebuie strânse (înscrisuri, martori, expertize, interogatorii).
        7. RECOMANDAREA FINALĂ: Care este cel mai bun curs de acțiune și care sunt primii 3 pași imediați pe care trebuie să îi facă avocatul.
        
        Fii extrem de detaliat. Oferă avocatului o analiză pe care să o poată prezenta direct clientului sau să o folosească în instanță.` }] }],
        tools: [{ googleSearch: {} }],
        config: { 
          systemInstruction: LEGAL_GUARDRAILS, 
          temperature: 0.1,
          topP: 0.8,
          topK: 40,
        }
      });
      
      for await (const chunk of responseStream) {
        const c = chunk as Record<string, unknown>;
        if (c['text']) {
          fullText += c['text'] as string;
          if (onChunk) onChunk(fullText);
        }
      }
      
      await this.consumeCredit(5);
      return fullText || "";
    } catch(e: unknown) { 
      console.error("AI Error:", e);
      const errorMessage = e instanceof Error ? e.message : String(e);
      if (errorMessage.includes('Incomplete JSON segment') || errorMessage.includes('TIMEOUT_CHUNK') || errorMessage.includes('TIMEOUT_LATENCY')) {
        if (fullText.length > 0) {
          return fullText;
        } else {
          return "Eroare AI: Conexiunea a fost întreruptă din cauza latenței. Vă rugăm să încercați din nou.";
        }
      }
      return `Eroare AI: ${errorMessage}. (Te rugăm să ne trimiți o captură de ecran cu această eroare pentru a o investiga). Nu v-au fost retrase credite.`;
    } finally { this._loading.set(false); }
  }

  async analyzeEvidence(fileBase64: string, mimeType: string, prompt: string, onChunk?: (chunk: string) => void): Promise<string> {
    if (!this.checkCredits(5)) return "Eroare: Credite insuficiente. Vă rugăm să vă reîncărcați contul.";
    this._loading.set(true);
    let fullText = "";
    try {
      const ai = await this.getAiInstance();
      const responseStream = await this.generateContentStreamWithFallback(ai, {
        contents: [{ role: 'user', parts: [{ inlineData: { mimeType, data: fileBase64 } }, { text: `Efectuează un audit juridic și o analiză detaliată a probatoriului atașat.
        Context/Cerere utilizator: ${prompt}.
        
        CERINȚE PENTRU AUDIT:
        1. ANALIZA FORMALĂ: Verifică dacă documentul îndeplinește condițiile de validitate (formă, semnături, termene, competență).
        2. ANALIZA PE FOND: Extrage ideile principale, obligațiile părților, clauzele abuzive sau punctele vulnerabile.
        3. CONFORMITATE LEGALĂ: Raportează conținutul documentului la legislația actuală. Există încălcări ale legii?
        4. RISCURI IDENTIFICATE: Ce riscuri juridice, financiare sau de business reies din acest document?
        5. RECOMANDĂRI DE REMEDIERE / ACȚIUNE: Cum poate fi îmbunătățită situația clientului? Ce acțiuni legale se impun (ex: notificare, reziliere, acțiune în anulare)?
        
        Oferă un raport structurat, clar, cu trimiteri exacte la textul documentului analizat și la lege.` }] }],
        tools: [{ googleSearch: {} }],
        config: { 
          systemInstruction: LEGAL_GUARDRAILS, 
          temperature: 0.1,
          topP: 0.8,
          topK: 40,
        }
      });
      
      for await (const chunk of responseStream) {
        const c = chunk as Record<string, unknown>;
        if (c['text']) {
          fullText += c['text'] as string;
          if (onChunk) onChunk(fullText);
        }
      }
      
      await this.consumeCredit(5);
      return fullText || "";
    } catch(e: unknown) { 
        console.error("AI Error:", e);
        const errorMessage = e instanceof Error ? e.message : String(e);
        if ((errorMessage.includes('Incomplete JSON segment') || errorMessage.includes('TIMEOUT_CHUNK') || errorMessage.includes('TIMEOUT_LATENCY')) && fullText.length > 0) {
          return fullText;
        }
        return `Eroare AI: ${errorMessage}. (Te rugăm să ne trimiți o captură de ecran cu această eroare pentru a o investiga). Nu v-au fost retrase credite.`; 
    } finally { this._loading.set(false); }
  }

  async generateEvidenceImage(prompt: string): Promise<string> {
    if (!this.checkCredits(5)) return "Eroare: Credite insuficiente. Vă rugăm să vă reîncărcați contul.";
    this._loading.set(true);
    try {
      const ai = await this.getAiInstance();
      
      // Note: For image generation with Imagen models, we use ai.models.generateImages
      const response = await ai.models.generateImages({
        model: 'imagen-3.0-generate-001',
        prompt: prompt,
        config: { numberOfImages: 1, outputMimeType: 'image/jpeg' }
      });
      await this.consumeCredit(5);
      const base64 = response.generatedImages?.[0]?.image?.imageBytes;
      return base64 ? `data:image/jpeg;base64,${base64}` : '';
    } catch(e: unknown) { 
      console.error("AI Image Generation failed:", e);
      return ""; 
    } finally { this._loading.set(false); }
  }

  async draftDocument(type: string, details: string, onChunk?: (chunk: string) => void): Promise<string> {
    if (!this.checkCredits(3)) return "Eroare: Credite insuficiente. Vă rugăm să vă reîncărcați contul.";
    this._loading.set(true);
    let fullText = "";
    try {
      const ai = await this.getAiInstance();
      const responseStream = await this.generateContentStreamWithFallback(ai, {
        contents: [{ role: 'user', parts: [{ text: `Redactează un document juridic complet și profesional de tipul: ${type}. 
        Detalii furnizate de utilizator: ${details}. 
        
        CERINȚE OBLIGATORII DE REDACTARE:
        1. STRUCTURĂ COMPLETĂ: Include antetul instanței/autorității (dacă este cazul), datele părților (lasă spații libere de tipul [Nume/Denumire], [CNP/CUI], [Adresă] dacă nu sunt furnizate), obiectul clar, motivele de fapt, motivele de drept, probele solicitate și semnătura.
        2. ARGUMENTARE JURIDICĂ: Dezvoltă motivele de fapt și de drept într-un mod logic, persuasiv și exhaustiv. Nu te rezuma la fraze scurte. Construiește argumente solide ca un avocat pledant cu experiență.
        3. TEMEI LEGAL ACTUALIZAT: Identifică și citează cu maximă precizie articolele de lege aplicabile (Codul Civil, Codul de Procedură Civilă, Codul Penal, legi speciale etc.). Verifică valabilitatea lor.
        4. LIMBAJ: Folosește un limbaj juridic formal, sobru, specific instanțelor din România.
        5. FORMAT: NU folosi formatare Markdown (fără asteriscuri **, fără diez #). Folosește doar text simplu, majuscule pentru titluri și spațieri clare între paragrafe.` }] }],
        tools: [{ googleSearch: {} }],
        config: { 
          systemInstruction: LEGAL_GUARDRAILS, 
          temperature: 0.1,
          topP: 0.8,
          topK: 40,
        }
      });
      
      for await (const chunk of responseStream) {
        const c = chunk as Record<string, unknown>;
        if (c['text']) {
          fullText += c['text'] as string;
          if (onChunk) onChunk(fullText);
        }
      }
      
      await this.consumeCredit(3);
      return fullText || "";
    } catch(e: unknown) { 
        console.error("AI Error:", e);
        const errorMessage = e instanceof Error ? e.message : String(e);
        if (errorMessage.includes('Incomplete JSON segment') || errorMessage.includes('TIMEOUT_CHUNK') || errorMessage.includes('TIMEOUT_LATENCY')) {
          if (fullText.length > 0) {
            return fullText;
          } else {
            return "Eroare AI: Conexiunea a fost întreruptă din cauza latenței. Vă rugăm să încercați din nou.";
          }
        }
        return `Eroare AI: ${errorMessage}. (Te rugăm să ne trimiți o captură de ecran cu această eroare pentru a o investiga). Nu v-au fost retrase credite.`; 
    } finally { this._loading.set(false); }
  }

  async calculateFees(context: string, onChunk?: (chunk: string) => void): Promise<string> {
    if (!this.checkCredits(2)) return "Eroare: Credite insuficiente. Vă rugăm să vă reîncărcați contul.";
    this._loading.set(true);
    let fullText = "";
    try {
      const ai = await this.getAiInstance();
      const responseStream = await this.generateContentStreamWithFallback(ai, {
        contents: [{ role: 'user', parts: [{ text: `Calculează taxele de timbru sau onorariile conform contextului: ${context}. 
        VERIFICĂ obligatoriu OUG 80/2013 și orice actualizări recente prin Google Search.` }] }],
        tools: [{ googleSearch: {} }],
        config: { 
          systemInstruction: LEGAL_GUARDRAILS, 
          temperature: 0.1,
          topP: 0.8,
          topK: 40,
        }
      });
      
      for await (const chunk of responseStream) {
        const c = chunk as Record<string, unknown>;
        if (c['text']) {
          fullText += c['text'] as string;
          if (onChunk) onChunk(fullText);
        }
      }
      
      await this.consumeCredit(2);
      return fullText || "";
    } catch(e: unknown) { 
        console.error("AI Error:", e);
        const errorMessage = e instanceof Error ? e.message : String(e);
        if (errorMessage.includes('Incomplete JSON segment') || errorMessage.includes('TIMEOUT_CHUNK') || errorMessage.includes('TIMEOUT_LATENCY')) {
          if (fullText.length > 0) {
            return fullText;
          } else {
            return "Eroare AI: Conexiunea a fost întreruptă din cauza latenței. Vă rugăm să încercați din nou.";
          }
        }
        return `Eroare AI: ${errorMessage}. (Te rugăm să ne trimiți o captură de ecran cu această eroare pentru a o investiga). Nu v-au fost retrase credite.`; 
    } finally { this._loading.set(false); }
  }

  async deleteTransaction(txId: string) {
    try {
      await deleteDoc(doc(db, 'transactions', txId));
      return { error: null };
    } catch (error: unknown) {
      console.error("Error deleting transaction:", error);
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }
}