'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Shield, KeyRound, UserCheck } from 'lucide-react';

export default function LoginPage() {
  const [role, setRole] = useState<'principal' | 'finance_officer' | 'regional_director'>('principal');

  const getPortalRoute = () => {
    switch (role) {
      case 'principal':
        return '/principal';
      case 'finance_officer':
        return '/dashboard';
      case 'regional_director':
        return '/dashboard';
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 p-8 rounded-2xl shadow-2xl space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex p-3 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 mb-2">
            <Shield className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold">Assembly Verification Portal</h1>
          <p className="text-xs text-slate-400">Select your role to simulate portal access</p>
        </div>

        <div className="space-y-4">
          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
            Select Role
          </label>
          <div className="grid grid-cols-1 gap-2">
            <button
              onClick={() => setRole('principal')}
              className={`p-3 rounded-xl text-left border text-sm transition-all ${
                role === 'principal'
                  ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400 font-semibold'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
              }`}
            >
              Principal (Mobile Capture)
            </button>

            <button
              onClick={() => setRole('finance_officer')}
              className={`p-3 rounded-xl text-left border text-sm transition-all ${
                role === 'finance_officer'
                  ? 'bg-sky-500/10 border-sky-500/40 text-sky-400 font-semibold'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
              }`}
            >
              Finance Officer (Region Verification)
            </button>

            <button
              onClick={() => setRole('regional_director')}
              className={`p-3 rounded-xl text-left border text-sm transition-all ${
                role === 'regional_director'
                  ? 'bg-indigo-500/10 border-indigo-500/40 text-indigo-400 font-semibold'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
              }`}
            >
              Regional Director (Executive Overview)
            </button>
          </div>
        </div>

        <Link
          href={getPortalRoute()}
          className="w-full py-3 rounded-xl font-semibold bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-600/20"
        >
          <KeyRound className="w-4 h-4" />
          Enter Portal as {role.replace('_', ' ').toUpperCase()}
        </Link>
      </div>
    </main>
  );
}
