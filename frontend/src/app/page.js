import Link from 'next/link';
import { Lock, ChevronRight } from 'lucide-react';

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col justify-between selection:bg-indigo-500 selection:text-white">
      {/* Background Soft Glows */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-purple-500/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 left-1/4 w-[300px] h-[300px] bg-indigo-500/5 rounded-full blur-[90px]" />
      </div>

      {/* Header */}
      <header className="relative z-10 border-b border-slate-200/80 bg-white/70 backdrop-blur-md px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-purple-500 to-indigo-600 flex items-center justify-center font-bold text-white shadow-md shadow-purple-500/20">
              S
            </div>
            <span className="font-bold text-lg tracking-tight text-slate-900">
              SecurePresent
            </span>
          </div>
          
          {/* Subtle Admin Link */}
          <Link 
            href="/admin" 
            className="flex items-center gap-1.5 text-xs text-slate-650 hover:text-indigo-600 bg-white hover:bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-lg shadow-sm transition-all duration-300 font-medium"
          >
            <Lock className="w-3.5 h-3.5" /> Admin Portal
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 max-w-4xl mx-auto px-6 py-24 flex-1 flex flex-col items-center justify-center text-center">
        
        {/* Intro */}
        <div className="max-w-2xl space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-600 text-xs font-semibold uppercase tracking-wider">
            🔒 Confined Presentation Delivery
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight leading-tight text-slate-900">
            Secure lecturing{' '}
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-purple-600 to-indigo-600">
              without slide exposure
            </span>
          </h1>
          <p className="text-sm md:text-base text-slate-500 max-w-lg mx-auto font-light leading-relaxed">
            Convert slides to secure vector HTML5 containers. Present with real-time websocket sync and enforce strict anti-theft controls on the browser.
          </p>
        </div>

        {/* Primary Action Card: Lecturer Focus */}
        <div className="w-full max-w-md mt-12">
          <Link href="/lecturer" className="group block">
            <div className="bg-white border border-slate-200/80 rounded-2xl p-8 hover:border-purple-500/50 hover:shadow-lg transition-all duration-300 text-left relative overflow-hidden shadow-md">
              <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/5 rounded-bl-full group-hover:bg-purple-500/10 transition-colors duration-300" />
              
              <div className="space-y-4 relative">
                <div className="w-12 h-12 rounded-xl bg-purple-500/10 text-purple-600 flex items-center justify-center font-bold text-lg border border-purple-500/20 group-hover:scale-105 transition-transform duration-300">
                  👨‍🏫
                </div>
                <div className="space-y-1">
                  <h3 className="text-xl font-bold text-slate-900 group-hover:text-purple-600 transition-colors">
                    Lecturer Presenter Hub
                  </h3>
                  <p className="text-slate-500 text-sm font-light leading-relaxed">
                    Select your assigned presentations, launch your synchronized classroom room, and control live slides securely.
                  </p>
                </div>
              </div>
              <div className="mt-8 pt-4 border-t border-slate-100 flex items-center justify-between text-purple-600 text-sm font-semibold group-hover:text-purple-500 transition-colors">
                <span>Enter Presenter Hub</span>
                <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          </Link>
        </div>

      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-slate-200/60 py-8 px-6 text-center text-xs text-slate-500">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>© 2026 SecurePresent Inc. All rights reserved.</p>
          <div className="flex gap-6">
            <span className="text-slate-400">Students access rooms via shared lecture links only.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
