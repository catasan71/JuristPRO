import { Component, inject, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { JuristService, ModuleType } from '../services/jurist.service';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="flex flex-col h-full bg-jurist-dark border-r border-gray-800 w-full flex-shrink-0 z-20 animate-fadeIn relative overflow-hidden">
      
      <!-- Artistic Background for Mobile (Right-side ghost image) - REFINED VISIBILITY -->
      <div class="lg:hidden absolute top-0 right-0 h-full w-[80%] pointer-events-none select-none overflow-hidden opacity-10 flex items-center justify-end z-0">
          <img src="https://images.unsplash.com/photo-1589829545856-d10d557cf95f?q=80&w=1000&auto=format&fit=crop" 
               alt="Themis Silhouette" 
               class="h-full w-auto object-contain grayscale contrast-125 rotate-3 scale-110 origin-right translate-x-12"
               referrerpolicy="no-referrer">
          <!-- Gradient overlay to blend it -->
          <div class="absolute inset-0 bg-gradient-to-l from-transparent via-jurist-dark/80 to-jurist-dark"></div>
      </div>

      <!-- Right side decorative accent border -->
      <div class="lg:hidden absolute top-0 right-0 w-[1px] h-full bg-gradient-to-b from-transparent via-jurist-orange/40 to-transparent z-10"></div>

      <!-- Logo -->
      <div class="relative z-10">
        <button (click)="nav('dashboard')" (keydown.enter)="nav('dashboard')" class="p-6 border-b border-gray-800 flex items-center gap-3 cursor-pointer group w-full text-left" aria-label="Go to dashboard">
          <div class="w-8 h-8 bg-jurist-orange rounded flex items-center justify-center shadow-neon group-hover:scale-110 transition-transform">
            <span class="text-black font-bold text-lg">J</span>
          </div>
          <h1 class="text-xl font-bold text-white tracking-wide">Jurist<span class="text-jurist-orange">PRO</span></h1>
        </button>
      </div>

      <!-- User Info / Credits -->
      <div class="relative z-10 p-4 bg-gray-900/60 m-4 rounded-2xl border border-gray-800/50 backdrop-blur-sm">
        <div class="flex justify-between items-center mb-2">
          <span class="text-[10px] text-gray-500 uppercase font-black tracking-widest">Plan: {{ juristService.plan() | titlecase }}</span>
          <button (click)="nav('pricing')" class="text-[10px] text-jurist-orange font-black uppercase hover:underline">PRO Upgrade</button>
        </div>
        <div class="mb-2">
           <p class="text-sm font-black text-white truncate tracking-tight">{{ authService.currentUser()?.fullName || 'Consilier Juridic' }}</p>
        </div>
        <div class="flex items-end gap-1.5">
          <span class="text-3xl font-black text-white leading-none">{{ juristService.credits() }}</span>
          <span class="text-[10px] text-gray-500 mb-1 font-bold uppercase tracking-wider">credite AI</span>
        </div>
        <div class="w-full bg-gray-800/50 h-1 rounded-full mt-3 overflow-hidden">
          <div class="bg-gradient-to-r from-jurist-orange to-orange-400 h-full transition-all duration-700 ease-out" [style.width.%]="getProgress()"></div>
        </div>
      </div>

      <!-- Navigation -->
      <nav class="relative z-10 flex-1 px-4 space-y-1 overflow-y-auto py-2 custom-scrollbar">
        <div class="text-[9px] text-gray-600 font-black uppercase tracking-[0.2em] mb-3 px-3 mt-4">Arhitectură Sistem</div>
        <button (click)="nav('dashboard')" [class]="getBtnClass('dashboard')">
          <span class="text-lg mr-3">📊</span> Dashboard
        </button>
        
        <div class="text-[10px] text-gray-600 font-bold uppercase tracking-wider mb-2 px-2 mt-4">Module AI</div>
        <button (click)="nav('assistant')" [class]="getBtnClass('assistant')">
          <span class="text-lg mr-3">🤖</span> Asistent AI
        </button>
        <button (click)="nav('strategy')" [class]="getBtnClass('strategy')">
          <span class="text-lg mr-3">🧠</span> Strategie
        </button>
        <button (click)="nav('drafting')" [class]="getBtnClass('drafting')">
          <span class="text-lg mr-3">📝</span> Redactare
        </button>
        <button (click)="nav('audit')" [class]="getBtnClass('audit')">
          <span class="text-lg mr-3">🔎</span> Analiză & Probe
        </button>

        <div class="text-[10px] text-gray-600 font-bold uppercase tracking-wider mb-2 px-2 mt-4">Administrativ</div>
        @if (authService.isAdmin()) {
          <button (click)="nav('admin-dashboard')" [class]="getBtnClass('admin-dashboard')">
            <span class="text-lg mr-3">👑</span> Panou Admin
          </button>
        }
        <button (click)="nav('fees')" [class]="getBtnClass('fees')">
          <span class="text-lg mr-3">🧮</span> Taxe & Onorarii
        </button>
        <button (click)="nav('calendar')" [class]="getBtnClass('calendar')">
          <span class="text-lg mr-3">📅</span> Calendar
        </button>
      </nav>

      <!-- Footer -->
      <div class="relative z-10 p-4 border-t border-gray-800 space-y-2">
        <button (click)="nav('profile')" [class]="getBtnClass('profile')">
          <span class="text-lg mr-3">⚙️</span> Profil Cabinet
        </button>
        <button (click)="nav('guide')" [class]="getBtnClass('guide')">
          <span class="text-lg mr-3">📖</span> Ghid de utilizare
        </button>
        <button (click)="logout()" class="w-full flex items-center px-4 py-2.5 rounded-xl transition-all duration-200 text-sm font-medium text-red-400 hover:bg-red-900/20 hover:text-red-300">
          <span class="text-lg mr-3">🚪</span> Deconectare
        </button>
        <p class="text-[10px] text-gray-600 text-center mt-2 font-bold uppercase tracking-widest opacity-40">JuristPRO • v2.4.9</p>
      </div>
    </div>
  `
})
export class SidebarComponent {
  juristService = inject(JuristService);
  authService = inject(AuthService);
  linkClick = output<void>();

  nav(module: ModuleType) {
    this.juristService.setModule(module);
    this.linkClick.emit();
  }
  
  logout() {
    this.authService.logout();
    this.juristService.setModule('landing');
    this.linkClick.emit();
  }

  getProgress(): number {
    const credits = this.juristService.credits();
    const plan = this.juristService.plan();
    
    if (plan === 'gold') return 100;
    const max = plan === 'trial' ? 5 : 150;
    return (credits / max) * 100;
  }

  getBtnClass(module: ModuleType) {
    const isActive = this.juristService.currentModule() === module;
    return `w-full flex items-center px-4 py-2.5 rounded-xl transition-all duration-200 text-sm font-medium ${
      isActive 
      ? 'bg-jurist-orange text-white shadow-neon' 
      : 'text-gray-400 hover:bg-gray-800 hover:text-white'
    }`;
  }
}