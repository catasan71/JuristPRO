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
        </div>
      </div>

      <!-- Edit/Create Modal - PRO ARCHITECTURE -->
      @if (showModal()) {
        <div class="fixed inset-0 z-[1000] flex items-center justify-center p-3 sm:p-5 bg-black/95 backdrop-blur-2xl animate-in fade-in duration-300 overflow-hidden">
          
          <!-- Modal Container -->
          <div class="bg-[#0a0a0a] border border-zinc-800/80 rounded-[2.5rem] w-full max-w-4xl shadow-[0_40px_120px_-20px_rgba(0,0,0,1)] flex flex-col h-full max-h-[90vh] relative overflow-hidden">
            
            <!-- Header -->
            <div class="h-24 px-8 border-b border-white/5 flex justify-between items-center bg-zinc-900/10 shrink-0">
              <div class="flex flex-col">
                <div class="flex items-center gap-3">
                  <div class="w-3.5 h-3.5 rounded-full bg-jurist-orange shadow-[0_0_15px_rgba(234,88,12,0.6)] animate-pulse"></div>
                  <h3 class="text-xl text-white font-black tracking-tight uppercase">
                    {{ currentEvent.id ? 'Documentație Dosar' : 'Constituire Dosar' }}
                  </h3>
                </div>
                <span class="text-[9px] text-zinc-500 font-bold uppercase tracking-[0.3em] mt-1.5 opacity-40">Sistem de Management Proactiv v2.4</span>
              </div>
              
              <button (click)="closeModal()" class="text-zinc-500 hover:text-white p-2.5 hover:bg-white/5 rounded-full transition-all">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-6 h-6 scale-125">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <!-- Body -->
            <div class="flex-1 overflow-y-auto p-10 custom-scrollbar select-text">
              <div class="grid grid-cols-1 lg:grid-cols-2 gap-12">
                
                <!-- Left Column -->
                <div class="space-y-8">
                  <div>
                    <h4 class="text-zinc-500 text-[10px] font-black uppercase tracking-[0.2em] mb-5 border-l-2 border-jurist-orange pl-3">Informații Dosar</h4>
                    <div class="space-y-5">
                        <div>
                          <label for="modalTitle" class="block text-[10px] font-black text-zinc-600 uppercase mb-2 ml-1">Număr Dosar / Denumire</label>
                          <input id="modalTitle" [ngModel]="currentEvent.title" (ngModelChange)="updateCurrentEvent('title', $event)" placeholder="Ex: 245/3/2024" class="w-full bg-zinc-900/40 border border-zinc-800/50 rounded-2xl p-4 text-white focus:border-jurist-orange outline-none transition-all font-medium placeholder-zinc-800">
                        </div>

                        <div class="grid grid-cols-2 gap-4">
                          <div>
                            <label for="modalDate" class="block text-[10px] font-black text-zinc-600 uppercase mb-2 ml-1">Data Termen</label>
                            <input id="modalDate" type="date" [ngModel]="currentEvent.date" (ngModelChange)="updateCurrentEvent('date', $event)" class="w-full bg-zinc-900/40 border border-zinc-800/50 rounded-2xl p-4 text-white focus:border-jurist-orange outline-none [color-scheme:dark]">
                          </div>
                          <div>
                            <label for="modalTime" class="block text-[10px] font-black text-zinc-600 uppercase mb-2 ml-1">Ora</label>
                            <input id="modalTime" type="time" [ngModel]="currentEvent.time" (ngModelChange)="updateCurrentEvent('time', $event)" class="w-full bg-zinc-900/40 border border-zinc-800/50 rounded-2xl p-4 text-white focus:border-jurist-orange outline-none [color-scheme:dark]">
                          </div>
                        </div>

                        <div>
                          <label for="modalClient" class="block text-[10px] font-black text-zinc-600 uppercase mb-2 ml-1">Client Beneficiar</label>
                          <input id="modalClient" [ngModel]="currentEvent.clientName" (ngModelChange)="updateCurrentEvent('clientName', $event)" placeholder="Identitate client" class="w-full bg-zinc-900/40 border border-zinc-800/50 rounded-2xl p-4 text-white focus:border-jurist-orange outline-none placeholder-zinc-800">
                        </div>

                        <div>
                          <label for="modalDetails" class="block text-[10px] font-black text-zinc-600 uppercase mb-2 ml-1">Instanța / Secția</label>
                          <input id="modalDetails" [ngModel]="currentEvent.details" (ngModelChange)="updateCurrentEvent('details', $event)" placeholder="Ex: Tribunalul Dolj" class="w-full bg-zinc-900/40 border border-zinc-800/50 rounded-2xl p-4 text-white focus:border-jurist-orange outline-none placeholder-zinc-800">
                        </div>
                    </div>
                  </div>

                  <!-- Alert Widget -->
                  <div class="p-6 bg-emerald-500/5 border border-emerald-500/10 rounded-[2rem] flex items-center justify-between">
                    <div class="flex items-center gap-4">
                        <div class="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-6 h-6">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                          </svg>
                        </div>
                        <div>
                          <div class="text-[11px] font-black text-white uppercase">Alertă Automată</div>
                          <div class="text-[9px] text-zinc-500 font-bold uppercase tracking-wider mt-1 opacity-60">Robot la fix 24h</div>
                        </div>
                    </div>
                    <label class="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" [ngModel]="currentEvent.whatsappAlert" (ngModelChange)="updateCurrentEvent('whatsappAlert', $event)" [disabled]="!juristService.profile().phone" class="sr-only peer">
                        <div class="w-12 h-6 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500 shadow-inner"></div>
                    </label>
                  </div>
                </div>

                <!-- Right Column -->
                <div class="space-y-8">
                  <!-- Finance -->
                  <div class="bg-zinc-900/20 p-7 rounded-[2.5rem] border border-white/5">
                      <h4 class="text-zinc-500 text-[10px] font-black uppercase tracking-[0.2em] mb-6 border-l-2 border-emerald-500 pl-3">Contabilitate</h4>
                      <div class="grid grid-cols-2 gap-4">
                        <div class="space-y-2">
                          <span class="text-[9px] text-zinc-600 uppercase font-black ml-1">Total (RON)</span>
                          <input type="number" [ngModel]="currentEvent.financial!.total" (ngModelChange)="updateFinancial('total', $event)" class="w-full bg-black/40 border border-zinc-800/80 rounded-xl p-4 text-sm text-white focus:border-emerald-500 outline-none">
                        </div>
                        <div class="space-y-2">
                          <span class="text-[9px] text-zinc-600 uppercase font-black ml-1">Încasat (RON)</span>
                          <input type="number" [ngModel]="currentEvent.financial!.paid" (ngModelChange)="updateFinancial('paid', $event)" class="w-full bg-black/40 border border-zinc-800/80 rounded-xl p-4 text-sm text-white focus:border-emerald-500 outline-none">
                        </div>
                      </div>
                      <div class="mt-5 flex justify-between items-center px-6 py-4 bg-emerald-500/5 rounded-2xl border border-emerald-500/10">
                        <span class="text-[10px] font-black text-emerald-500 uppercase">Restanță</span>
                        <span class="text-xl font-black text-emerald-400 font-mono">{{ currentEvent.financial!.rest }} RON</span>
                      </div>
                  </div>

                  <!-- Strategy -->
                  <div class="flex flex-col flex-1 min-h-[250px]">
                      <div class="flex justify-between items-center mb-4">
                        <h4 class="text-zinc-500 text-[10px] font-black uppercase tracking-[0.2em] border-l-2 border-blue-500 pl-3">Strategie</h4>
                        <button (click)="toggleDictation()" [class]="'flex items-center gap-2 px-5 py-2.5 rounded-full text-[9px] font-black transition-all ' + (isListening ? 'bg-white text-black shadow-[0_0_25px_rgba(255,255,255,0.4)]' : 'bg-transparent text-zinc-500 border border-zinc-800')">
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
                          </svg>
                          {{ isListening ? 'DICTEZ...' : 'VOCAL' }}
                        </button>
                      </div>
                      <textarea 
                        [ngModel]="currentEvent.notes" 
                        (ngModelChange)="updateCurrentEvent('notes', $event)"
                        class="flex-1 w-full bg-zinc-900/20 border border-zinc-800/50 rounded-[2rem] p-7 text-sm text-zinc-300 focus:border-jurist-orange outline-none resize-none transition-all placeholder-zinc-800 font-medium" 
                        placeholder="Notează obiectivele strategice..."></textarea>
                  </div>
                </div>
              </div>
            </div>

            <!-- Footer -->
            <div class="h-32 px-10 border-t border-white/5 bg-zinc-900/30 flex flex-col sm:flex-row justify-between items-center gap-6 shrink-0">
              <div class="hidden sm:flex items-center gap-5">
                  <div class="w-10 h-10 rounded-2xl bg-zinc-800 flex items-center justify-center text-zinc-500">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5 scale-90">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751A11.959 11.959 0 0112 2.714z" />
                    </svg>
                  </div>
                  <div class="flex flex-col">
                    <span class="text-[11px] text-zinc-400 font-black uppercase tracking-tight">Securitate Cloud Activă</span>
                    <span class="text-[8px] text-zinc-700 font-bold uppercase tracking-widest">Protocol Criptare AES-256</span>
                  </div>
              </div>
              
              <div class="flex items-center gap-5 w-full sm:w-auto">
                <button (click)="closeModal()" class="flex-1 sm:flex-none px-12 py-4.5 rounded-2xl text-zinc-500 hover:text-white font-black transition-all uppercase text-[11px] tracking-[0.2em]">Abandon</button>
                <button (click)="saveEvent()" [disabled]="saving() || !currentEvent.title" class="flex-1 sm:flex-none px-20 py-4.5 rounded-2xl bg-jurist-orange text-white font-black hover:bg-orange-600 transition-all active:scale-95 disabled:opacity-30 shadow-2xl shadow-orange-950/40 uppercase text-[11px] tracking-[0.2em] flex items-center justify-center gap-3">
                  @if (saving()) {
                      <div class="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                  }
                  {{ saving() ? 'PROCESARE...' : (currentEvent.id ? 'ACTUALIZARE' : 'FINALIZARE') }}
                </button>
              </div>
            </div>
          </div>
        </div>
      }
    </div>
  `
})
export class CalendarComponent implements OnInit {
  juristService = inject(JuristService);
  aiPrompt = '';
  aiResponse = signal<string>('');
  
  // New state for mobile tabs
  mobileTab = signal<'agenda' | 'calculator'>('agenda');
  
  showModal = signal(false);
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

  currentEventSignal = signal<Partial<CalendarEvent>>({ ...this.defaultEvent });
  
  get currentEvent() { return this.currentEventSignal(); }
  
  // Helper to update signal properties
  updateCurrentEvent(field: string, value: any) {
    this.currentEventSignal.update(s => ({ ...s, [field]: value }));
    console.log('Event updated:', field, value);
  }

  // Helper for nested financial field
  updateFinancial(field: string, value: any) {
    this.currentEventSignal.update(s => {
      const total = field === 'total' ? value : (s.financial?.total || 0);
      const paid = field === 'paid' ? value : (s.financial?.paid || 0);
      const rest = total - paid;
      return { 
        ...s, 
        financial: { total, paid, rest } 
      };
    });
  }

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
      // Deep copy to avoid binding issues
      this.currentEventSignal.set(JSON.parse(JSON.stringify(event)));
    } else {
      const newEvent = JSON.parse(JSON.stringify(this.defaultEvent));
      newEvent.id = ''; // Ensure it's empty for creation
      
      if (this.juristService.profile().phone) {
        newEvent.whatsappAlert = true;
      }
      this.currentEventSignal.set(newEvent);
    }
    this.showModal.set(true);
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
    this.showModal.set(false);
    this.stopDictation();
  }

  async saveEvent() {
    const current = this.currentEventSignal();
    if(!current.title) return;

    this.saving.set(true);
    try {
      const financial = current.financial || { total: 0, paid: 0, rest: 0 };
      const eventToSave: CalendarEvent = {
        ...this.defaultEvent,
        ...current,
        financial: { ...financial }
      } as CalendarEvent;

      if (eventToSave.id) {
        await this.juristService.updateEvent(eventToSave);
      } else {
        await this.juristService.addEvent(eventToSave);
      }

      this.saving.set(false);
      this.closeModal();
    } catch (err) {
      console.error('Error saving event:', err);
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
          const currentNotes = this.currentEventSignal().notes || '';
          this.updateCurrentEvent('notes', currentNotes + (currentNotes ? ' ' : '') + transcript);
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