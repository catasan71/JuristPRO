import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { JuristService, CalendarEvent } from '../services/jurist.service';

interface SpeechRecognitionEvent {
  results: { transcript: string }[][];
}

interface ISpeechRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: (event: SpeechRecognitionEvent) => void;
  onerror: (event: unknown) => void;
  onend: () => void;
  start: () => void;
  stop: () => void;
}

@Component({
  selector: 'app-calendar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="h-full flex flex-col bg-jurist-card rounded-xl border border-gray-800 shadow-neon overflow-hidden relative animate-fadeIn">
      <!-- Loading Overlay -->
      @if (saving()) {
        <div class="absolute inset-0 bg-black/60 z-50 flex items-center justify-center">
           <div class="bg-gray-900 p-6 rounded-xl border border-jurist-orange flex flex-col items-center gap-4">
             <div class="w-8 h-8 border-4 border-jurist-orange border-t-transparent rounded-full animate-spin"></div>
             <span class="text-white font-bold">Salvăm Dosarul...</span>
           </div>
        </div>
      }

      <!-- Header -->
      <div class="p-6 border-b border-gray-800 bg-jurist-dark flex justify-between items-center">
        <div>
           <h2 class="text-2xl font-bold text-jurist-orange mb-1">Calendar & Termene</h2>
           <p class="text-sm text-gray-400">Management dosare • Termene procedurale • Memento</p>
        </div>
        <button (click)="openModal(null)" class="bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm border border-gray-600 transition-colors flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          <span class="hidden sm:inline">Dosar Nou</span>
        </button>
      </div>

      <!-- Mobile Tabs Switcher -->
      <div class="lg:hidden flex border-b border-gray-800 bg-gray-900/50">
        <button 
          (click)="mobileTab.set('agenda')" 
          [class]="'flex-1 py-3 text-sm font-bold transition-colors ' + (mobileTab() === 'agenda' ? 'text-jurist-orange border-b-2 border-jurist-orange' : 'text-gray-400')"
        >
          📅 Agenda
        </button>
        <button 
          (click)="mobileTab.set('calculator')" 
          [class]="'flex-1 py-3 text-sm font-bold transition-colors ' + (mobileTab() === 'calculator' ? 'text-jurist-orange border-b-2 border-jurist-orange' : 'text-gray-400')"
        >
          🤖 Calculator AI
        </button>
      </div>

      <div class="flex-1 overflow-y-auto p-4 lg:p-6 flex flex-col lg:flex-row gap-6 animate-slideUp">
        
        <!-- Timeline View (Agenda) -->
        <div [class]="'flex-1 space-y-6 ' + (mobileTab() === 'agenda' ? 'block' : 'hidden lg:block')">
          <h3 class="text-white font-bold mb-4 pl-2 border-l-4 border-jurist-orange hidden lg:block">Agenda Următoare</h3>
          
          <div class="space-y-4">
             @for (event of juristService.events(); track event.id) {
               <div (click)="openModal(event)" (keyup.enter)="openModal(event)" tabindex="0" class="bg-gray-900 border border-gray-800 p-4 sm:p-5 rounded-xl flex items-start gap-3 sm:gap-4 hover:border-jurist-orange transition-all cursor-pointer relative overflow-hidden group">
                 <!-- Date Badge -->
                 <div class="bg-gray-800 rounded-lg p-2 text-center min-w-[70px] sm:min-w-[80px] self-stretch flex flex-col justify-center">
                   <span class="block text-xs text-gray-400 uppercase">{{ event.date | date:'MMM' }}</span>
                   <span class="block text-2xl sm:text-3xl font-bold text-white">{{ event.date | date:'dd' }}</span>
                   <span class="block text-[10px] sm:text-xs text-gray-400 font-mono">{{ event.time }}</span>
                 </div>
                 
                 <!-- Content -->
                 <div class="flex-1 min-w-0">
                   <div class="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-1">
                     <div class="min-w-0">
                       <h4 class="text-base sm:text-lg font-bold text-white truncate pr-2">{{ event.title }}</h4>
                       <p class="text-jurist-orange text-xs sm:text-sm font-semibold truncate">{{ event.clientName }}</p>
                     </div>
                     <span [class]="getBadgeClass(event.type) + ' self-start sm:self-auto'">{{ getTypeLabel(event.type) }}</span>
                   </div>
                   
                   <p class="text-gray-400 text-xs sm:text-sm mt-1 italic truncate">{{ event.caseObject }}</p>
                   
                   <!-- FIX: Financial Mini-Status & Alerts (Wrapped for mobile) -->
                   <div class="mt-3 flex flex-wrap items-center justify-between gap-y-2 text-xs border-t border-gray-800 pt-2">
                     <div class="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono w-full sm:w-auto">
                       <span class="text-gray-400 whitespace-nowrap">Total: <span class="text-white">{{ event.financial.total }}</span></span>
                       <span [class]="(event.financial.rest > 0 ? 'text-red-400' : 'text-green-500') + ' whitespace-nowrap'">
                         Rest: {{ event.financial.rest }}
                       </span>
                     </div>
                     @if (event.whatsappAlert) {
                       <button 
                         (click)="$event.stopPropagation(); juristService.sendWhatsAppAlert(event)" 
                         class="flex items-center gap-1 text-green-400 hover:text-green-300 ml-auto sm:ml-0 bg-green-400/10 px-2 py-0.5 rounded border border-green-400/20 transition-colors" 
                         title="Trimite Alerta WhatsApp Acum"
                       >
                         <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" class="bi bi-whatsapp" viewBox="0 0 16 16">
                           <path d="M13.601 2.326A7.854 7.854 0 0 0 7.994 0C3.627 0 .068 3.558.064 7.926c0 1.399.366 2.76 1.057 3.965L0 16l4.204-1.102a7.933 7.933 0 0 0 3.79.965h.004c4.368 0 7.926-3.558 7.93-7.93A7.898 7.898 0 0 0 13.6 2.326zM7.994 14.521a6.573 6.573 0 0 1-3.356-.92l-.24-.144-2.494.654.666-2.433-.156-.251a6.56 6.56 0 0 1-1.007-3.505c0-3.626 2.957-6.584 6.591-6.584a6.56 6.56 0 0 1 4.66 1.931 6.557 6.557 0 0 1 1.928 4.66c-.004 3.639-2.961 6.592-6.592 6.592zm3.615-4.934c-.197-.099-1.17-.578-1.353-.646-.182-.065-.315-.099-.445.099-.133.197-.513.646-.627.775-.114.133-.232.148-.43.05-.197-.1-.836-.308-1.592-.985-.59-.525-.985-1.175-1.103-1.372-.114-.198-.011-.304.088-.403.087-.088.197-.232.296-.346.1-.114.133-.198.198-.33.065-.134.034-.248-.015-.347-.05-.099-.445-1.076-.612-1.47-.16-.389-.323-.335-.445-.34-.114-.007-.247-.007-.38-.007a.729.729 0 0 0-.529.247c-.182.198-.691.677-.691 1.654 0 .977.71 1.916.81 2.049.098.133 1.394 2.132 3.383 2.992.47.205.84.326 1.129.418.475.152.904.129 1.246.08.38-.058 1.171-.48 1.338-.943.164-.464.164-.86.114-.943-.049-.084-.182-.133-.38-.232z"/>
                         </svg>
                         <span class="text-[10px] font-bold">Trimite Alertă</span>
                       </button>
                     }
                   </div>
                 </div>
                 
                 <!-- Edit Icon on Hover (Desktop) / Always Visible (Mobile - Optional, but keeping clean) -->
                 <div class="hidden sm:block absolute right-4 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div class="bg-jurist-orange p-2 rounded-full text-black shadow-neon">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
                      </svg>
                    </div>
                 </div>
               </div>
             }
             
             @if (juristService.events().length === 0) {
               <div class="text-center text-gray-600 py-10">Nu există dosare programate.</div>
             }
          </div>
        </div>

        <!-- AI Sidebar (Calcul Termene) -->
        <div [class]="'w-full lg:w-1/3 bg-gray-900/50 lg:border-l border-gray-800 lg:p-6 p-1 rounded-xl lg:rounded-none ' + (mobileTab() === 'calculator' ? 'block' : 'hidden lg:block')">
          <h3 class="text-jurist-orange font-bold mb-4 flex items-center gap-2">
             <span>🤖</span> Calculator Termene AI
          </h3>
          <p class="text-sm text-gray-400 mb-4">Introduceți data comunicării și durata termenului. AI-ul va calcula data scadentă conform CPC (sistemul "pe zile libere", weekend-uri, sărbători).</p>
          
          <div class="relative group">
            <textarea 
                [(ngModel)]="aiPrompt"
                rows="5" 
                class="w-full bg-black border border-gray-700 rounded-lg p-4 text-sm text-white mb-3 focus:border-jurist-orange leading-relaxed"
                placeholder="Ex: Hotărârea mi-a fost comunicată Vineri, 1 Octombrie 2024. Când se împlinește termenul de apel de 30 de zile?"
            ></textarea>
            <div class="absolute bottom-5 right-3 text-[10px] text-gray-500 bg-black/80 px-1 rounded">
                Referință: Art. 181 NCPC
            </div>
          </div>

          <button 
             (click)="askAI()"
             [disabled]="!aiPrompt || juristService.isLoading()"
             class="w-full bg-white text-black font-bold py-3 rounded-lg hover:bg-gray-200 transition-all flex items-center justify-center gap-2"
          >
            @if(juristService.isLoading()) {
                <div class="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
            }
            Calculează Termene Exacte
          </button>
          
          @if (aiResponse()) {
            <div class="mt-6 p-5 bg-gray-800 rounded-xl border border-gray-600 shadow-lg relative animate-fadeIn">
                <div class="absolute -top-3 left-4 bg-jurist-orange text-black text-[10px] font-bold px-2 py-0.5 rounded">REZULTAT CALCUL</div>
                <div class="text-sm text-gray-200 whitespace-pre-wrap leading-relaxed font-mono">{{ aiResponse() }}</div>
            </div>
          }
    <!-- Edit/Create Modal - ULTRA STABLE -->
    @if (showModal) {
      <div class="fixed inset-0 z-[999] flex items-center justify-center p-3 sm:p-5 bg-black/90 backdrop-blur-md overflow-hidden select-none">
        
        <!-- Modal Container: Fixed Size, No Jumping -->
        <div class="bg-[#111111] border border-zinc-800 rounded-[2rem] w-full max-w-4xl shadow-[0_0_80px_rgba(0,0,0,0.8)] flex flex-col h-full max-h-[92vh] animate-in fade-in zoom-in duration-300 relative">
          
          <!-- Glossy Header - Static -->
          <div class="p-6 border-b border-white/5 flex justify-between items-center bg-zinc-900/40 rounded-t-[2rem] shrink-0">
            <div class="flex flex-col">
              <div class="flex items-center gap-3">
                <div class="w-2.5 h-2.5 rounded-full bg-jurist-orange animate-pulse"></div>
                <h3 class="text-xl text-white font-black tracking-tight uppercase">
                  {{ currentEvent.id ? 'Editare Dosar' : 'Documentare Dosar Nou' }}
                </h3>
              </div>
              <span class="text-[9px] text-zinc-500 font-bold uppercase tracking-[0.3em] mt-1">Sistem Centralizat de Management Juridic</span>
            </div>
            
            <button (click)="closeModal()" class="text-zinc-500 hover:text-white p-2 hover:bg-white/5 rounded-full transition-all">
              <mat-icon class="scale-125">close</mat-icon>
            </button>
          </div>

          <!-- Body - Solid Scroll Area -->
          <div class="flex-1 overflow-y-auto p-8 custom-scrollbar space-y-12 select-text">
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-12">
              
              <!-- SECTION: CASE DETAILS -->
              <div class="space-y-6">
                <h4 class="text-zinc-500 text-[10px] font-black uppercase tracking-[0.2em] border-l-2 border-jurist-orange pl-3">Informații Procesuale</h4>
                
                <div class="space-y-4">
                  <div>
                     <label for="modalTitle" class="block text-[10px] font-black text-zinc-500 uppercase mb-2 ml-1">Număr Dosar / Denumire</label>
                     <input id="modalTitle" [(ngModel)]="currentEvent.title" placeholder="Ex: 245/3/2024" class="w-full bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4 text-white focus:border-jurist-orange focus:ring-0 transition-all font-medium">
                  </div>

                  <div class="grid grid-cols-2 gap-4">
                    <div>
                      <label for="modalDate" class="block text-[10px] font-black text-zinc-500 uppercase mb-2 ml-1">Data Termen</label>
                      <input id="modalDate" type="date" [(ngModel)]="currentEvent.date" class="w-full bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4 text-white focus:border-jurist-orange [color-scheme:dark]">
                    </div>
                    <div>
                      <label for="modalTime" class="block text-[10px] font-black text-zinc-500 uppercase mb-2 ml-1">Ora</label>
                      <input id="modalTime" type="time" [(ngModel)]="currentEvent.time" class="w-full bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4 text-white focus:border-jurist-orange [color-scheme:dark]">
                    </div>
                  </div>

                  <div>
                     <label for="modalClient" class="block text-[10px] font-black text-zinc-500 uppercase mb-2 ml-1">Client Beneficiar</label>
                     <input id="modalClient" [(ngModel)]="currentEvent.clientName" placeholder="Numele clientului" class="w-full bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4 text-white focus:border-jurist-orange">
                  </div>

                  <div>
                     <label for="modalDetails" class="block text-[10px] font-black text-zinc-500 uppercase mb-2 ml-1">Instanța / Secția</label>
                     <input id="modalDetails" [(ngModel)]="currentEvent.details" placeholder="Ex: Tribunalul Dolj, Secția Civilă" class="w-full bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4 text-white focus:border-jurist-orange">
                  </div>
                </div>
              </div>

              <!-- SECTION: SECONDARY INFO -->
              <div class="space-y-8">
                <!-- Automation Banner -->
                <div class="p-6 bg-gradient-to-br from-green-950/30 to-zinc-900 border border-green-500/30 rounded-3xl group">
                   <div class="flex items-center justify-between mb-4">
                      <div class="flex items-center gap-3">
                         <div class="bg-green-500/10 p-2.5 rounded-2xl text-green-500 group-hover:rotate-12 transition-transform">
                            <mat-icon>notifications_active</mat-icon>
                         </div>
                         <span class="text-xs font-black text-green-500 uppercase tracking-tighter">Robot Alerte</span>
                      </div>
                      <label class="relative inline-flex items-center cursor-pointer scale-110">
                        <input type="checkbox" [(ngModel)]="currentEvent.whatsappAlert" [disabled]="!juristService.profile().phone" class="sr-only peer">
                        <div class="w-12 h-6 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-green-600"></div>
                      </label>
                   </div>
                   <p class="text-[10px] text-zinc-400 leading-relaxed">Sistemul va trimite automat o notificare prin WhatsApp clientului cu fix 24 de ore înainte de termen.</p>
                </div>

                <!-- Financial Status -->
                <div class="space-y-4">
                   <h4 class="text-zinc-500 text-[10px] font-black uppercase tracking-[0.2em] border-l-2 border-green-600 pl-3">Contabilitate Dosar</h4>
                   <div class="grid grid-cols-3 gap-3">
                      <div class="bg-zinc-900/50 p-4 rounded-2xl border border-zinc-800">
                        <span class="block text-[8px] font-bold text-zinc-500 uppercase mb-2">Total</span>
                        <input type="number" [(ngModel)]="currentEvent.financial!.total" (input)="calcRest()" class="w-full bg-transparent text-white font-mono text-lg outline-none">
                      </div>
                      <div class="bg-green-900/10 p-4 rounded-2xl border border-green-900/30">
                        <span class="block text-[8px] font-bold text-green-600 uppercase mb-2">Incasat</span>
                        <input type="number" [(ngModel)]="currentEvent.financial!.paid" (input)="calcRest()" class="w-full bg-transparent text-green-400 font-mono text-lg outline-none">
                      </div>
                      <div class="bg-red-900/10 p-4 rounded-2xl border border-red-900/30">
                        <span class="block text-[8px] font-bold text-red-600 uppercase mb-2">Rest</span>
                        <div class="text-red-500 font-mono text-lg font-bold">{{ currentEvent.financial!.rest }}</div>
                      </div>
                   </div>
                </div>

                <!-- Strategic Notes -->
                <div class="space-y-3">
                   <div class="flex justify-between items-center">
                     <h4 class="text-zinc-500 text-[10px] font-black uppercase tracking-[0.2em] border-l-2 border-blue-500 pl-3">Strategie & Notițe</h4>
                     <button (click)="toggleDictation()" [class]="'flex items-center gap-2 px-4 py-2 rounded-full text-[9px] font-black transition-all ' + (isListening ? 'bg-white text-black shadow-[0_0_20px_rgba(255,255,255,0.4)]' : 'bg-transparent text-zinc-500 border border-zinc-800 font-bold')">
                        <mat-icon class="text-[14px] w-3 h-3">{{ isListening ? 'mic' : 'mic_none' }}</mat-icon>
                        {{ isListening ? 'DICTEZ...' : 'VOCAL' }}
                     </button>
                   </div>
                   <textarea [(ngModel)]="currentEvent.notes" class="w-full bg-zinc-900/30 border border-zinc-800 rounded-3xl p-5 text-sm text-zinc-300 focus:border-jurist-orange outline-none h-32 md:h-44 resize-none transition-all placeholder-zinc-700" placeholder="Obiective, martori, probe, concluzii..."></textarea>
                </div>
              </div>
            </div>
          </div>

          <!-- Solid Action Footer - Static -->
          <div class="p-8 border-t border-white/5 bg-zinc-900/60 rounded-b-[2rem] flex flex-col sm:flex-row justify-between items-center gap-4 shrink-0">
             <div class="hidden sm:flex items-center gap-2 text-[10px] text-zinc-500 font-bold uppercase italic">
                <mat-icon class="text-[12px] w-3 h-3">security</mat-icon> Salvare securizată Cloud
             </div>
             <div class="flex items-center gap-4 w-full sm:w-auto">
               <button (click)="closeModal()" class="flex-1 sm:flex-none px-8 py-4 rounded-2xl text-zinc-400 hover:text-white font-bold transition-all uppercase text-[11px] tracking-widest">Anulează</button>
               <button (click)="saveEvent()" [disabled]="saving() || !currentEvent.title" class="flex-1 sm:flex-none px-12 py-4 rounded-2xl bg-jurist-orange text-white font-black hover:bg-orange-600 transition-all active:scale-95 disabled:opacity-30 shadow-2xl shadow-orange-950/20 uppercase text-[11px] tracking-widest">
                 {{ saving() ? 'Salvare...' : (currentEvent.id ? 'Actualizează' : 'Finalizează') }}
               </button>
             </div>
          </div>
        </div>
      </div>
    }
  `
})
export class CalendarComponent implements OnInit {
  juristService = inject(JuristService);
  aiPrompt = '';
  aiResponse = signal<string>('');
  
  // New state for mobile tabs
  mobileTab = signal<'agenda' | 'calculator'>('agenda');
  
  showModal = false;
  saving = signal(false);

  isListening = false;
  recognition: ISpeechRecognition | null = null;

  defaultEvent: CalendarEvent = {
    id: '',
    title: '',
    clientName: '',
    caseObject: '',
    date: new Date().toISOString().split('T')[0],
    time: '09:00',
    type: 'court',
    details: '',
    notes: '',
    whatsappAlert: false,
    financial: { total: 0, paid: 0, rest: 0 }
  };

  currentEvent: Partial<CalendarEvent> = { ...this.defaultEvent };

  constructor() {
    this.initSpeechRecognition();
  }

  getBadgeClass(type: string) {
    switch(type) {
      case 'court': return 'px-2 py-0.5 rounded text-[10px] font-bold bg-red-900/50 text-red-200 border border-red-800 uppercase tracking-wide';
      case 'deadline': return 'px-2 py-0.5 rounded text-[10px] font-bold bg-yellow-900/50 text-yellow-200 border border-yellow-800 uppercase tracking-wide';
      case 'meeting': return 'px-2 py-0.5 rounded text-[10px] font-bold bg-blue-900/50 text-blue-200 border border-blue-800 uppercase tracking-wide';
      default: return '';
    }
  }
  
  getTypeLabel(type: string) {
    switch(type) {
      case 'court': return 'Instanță';
      case 'deadline': return 'Termen';
      case 'meeting': return 'Întâlnire';
      default: return type;
    }
  }

  async askAI() {
    // 1. Get Today's Date in Romanian Format
    const today = new Date().toLocaleDateString('ro-RO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    // 2. Construct a stronger context for the AI
    const context = `
      Ești un Expert Calculator de Termene Procedurale (Codul de Procedură Civilă/Penală din România).
      DATA DE REFERINȚĂ (ASTĂZI) ESTE: ${today}.
      
      Reguli obligatorii de calcul (Art. 181 NCPC):
      1. Nu lua în calcul prima zi (ziua de pornire/comunicare), cu excepția termenelor pe ore.
      2. Termenul se împlinește la ora 24:00 a ultimei zile.
      3. Dacă ultima zi e nelucrătoare (sâmbătă, duminică, sărbătoare legală), termenul se prelungește automat până la sfârșitul primei zile lucrătoare următoare.
      4. Sistemul este "pe zile libere" (nu intră în calcul nici ziua de start, nici ziua de final) DOAR dacă utilizatorul specifică explicit acest lucru (de regulă pentru termenele de depunere a concluziilor scrise). Altfel, folosește regula standard.

      Sarcina ta:
      Calculează exact data împlinirii termenului pe baza input-ului utilizatorului.
      Specifică clar dacă data cade în weekend și se prorogă.

      Input utilizator: ${this.aiPrompt}
    `;

    this.aiResponse.set(""); // Clear previous response
    const res = await this.juristService.chatWithAssistant(context, (text) => {
      this.aiResponse.set(text);
    });
    this.aiResponse.set(res.content);
  }

  openModal(event: CalendarEvent | null) {
    if (event) {
      this.currentEvent = JSON.parse(JSON.stringify(event));
    } else {
      this.currentEvent = JSON.parse(JSON.stringify(this.defaultEvent));
      this.currentEvent.id = ''; 
      
      if (this.juristService.profile().phone) {
        this.currentEvent.whatsappAlert = true;
      }
    }
    this.showModal = true;
  }

  ngOnInit() {
    this.checkPendingAlerts();
  }

  // AUTOMATION: Proactively check for upcoming alerts that haven't been sent
  private checkPendingAlerts() {
    setTimeout(() => {
      const todayStr = new Date().toISOString().split('T')[0];
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split('T')[0];

      const pending = this.juristService.events().filter(e => 
        (e.date === todayStr || e.date === tomorrowStr) && 
        e.whatsappAlert
      );

      if (pending.length > 0 && this.juristService.profile().phone) {
        // We could automatically pop one here, but it's better to show a "Sync" button if multiple
        console.log(`Found ${pending.length} pending WhatsApp alerts.`);
      }
    }, 2000);
  }

  closeModal() {
    this.showModal = false;
    this.stopDictation();
  }

  calcRest() {
    if (this.currentEvent.financial) {
      this.currentEvent.financial.rest = this.currentEvent.financial.total - this.currentEvent.financial.paid;
    }
  }

  async saveEvent() {
    if(!this.currentEvent.title) return;

    if (!this.currentEvent.financial) {
        this.currentEvent.financial = { total: 0, paid: 0, rest: 0 };
    }
    if (this.currentEvent.whatsappAlert === undefined) {
      this.currentEvent.whatsappAlert = false;
    }

    this.saving.set(true);
    try {
      const eventToSave = this.currentEvent as CalendarEvent;
      if (this.currentEvent.id) {
        await this.juristService.updateEvent(eventToSave);
      } else {
        await this.juristService.addEvent(eventToSave);
      }

      this.saving.set(false);
      this.closeModal();
    } catch {
      this.saving.set(false);
    }
  }

  initSpeechRecognition() {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as unknown as { SpeechRecognition: new () => ISpeechRecognition }).SpeechRecognition || (window as unknown as { webkitSpeechRecognition: new () => ISpeechRecognition }).webkitSpeechRecognition;
      if (SpeechRecognition) {
        this.recognition = new SpeechRecognition();
        this.recognition.lang = 'ro-RO';
        this.recognition.continuous = true;
        this.recognition.interimResults = false;

        this.recognition.onresult = (event: SpeechRecognitionEvent) => {
          const transcript = event.results[event.results.length - 1][0].transcript;
          this.currentEvent.notes += (this.currentEvent.notes ? ' ' : '') + transcript;
        };

        this.recognition.onerror = () => {
          this.isListening = false;
        };
        
        this.recognition.onend = () => {
             if (this.isListening) { 
                 try { this.recognition?.start(); } catch (e) { console.error(e); }
             }
        };
      }
    }
  }

  toggleDictation() {
    if (!this.recognition) {
      console.warn("Browserul dvs. nu suportă dictarea vocală.");
      return;
    }

    if (this.isListening) {
      this.stopDictation();
    } else {
      this.startDictation();
    }
  }

  startDictation() {
    this.isListening = true;
    try {
      this.recognition?.start();
    } catch (e) {
      console.error(e);
    }
  }

  stopDictation() {
    this.isListening = false;
    try {
      this.recognition?.stop();
    } catch (e) {
      console.error(e);
    }
  }
}