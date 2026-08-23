'use client';

import React, { useState } from 'react';
import { CheckCircle2, AlertOctagon, Calendar, AlertTriangle, ShieldCheck, Filter } from 'lucide-react';
import { format } from 'date-fns';

interface MockSubmission {
  id: string;
  campusName: string;
  campusCode: string;
  photoUrl: string;
  submittedAt: string;
  isLate: boolean;
  status: 'pending' | 'verified' | 'flagged';
}

const INITIAL_SUBMISSIONS: MockSubmission[] = [
  {
    id: '1',
    campusName: 'Apex Heights Campus',
    campusCode: 'CAMP-NORTH-01',
    photoUrl: 'https://images.unsplash.com/photo-1577896851231-70ef18881754?w=600&auto=format&fit=crop',
    submittedAt: '09:15 AM',
    isLate: false,
    status: 'pending',
  },
  {
    id: '2',
    campusName: 'Valley View Campus',
    campusCode: 'CAMP-NORTH-02',
    photoUrl: 'https://images.unsplash.com/photo-1580582932707-520aed937b7b?w=600&auto=format&fit=crop',
    submittedAt: '10:45 AM',
    isLate: true,
    status: 'pending',
  },
];

export default function FinanceOfficerPortal() {
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [submissions, setSubmissions] = useState<MockSubmission[]>(INITIAL_SUBMISSIONS);

  const handleAction = (id: string, newStatus: 'verified' | 'flagged') => {
    setSubmissions((prev) =>
      prev.map((sub) => (sub.id === id ? { ...sub, status: newStatus } : sub))
    );
  };

  const delinquentCount = submissions.filter((s) => s.isLate || s.status === 'flagged').length;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 pb-4 border-b border-slate-800">
        <div>
          <h1 className="text-2xl font-bold text-sky-400">Finance Verification Dashboard</h1>
          <p className="text-sm text-slate-400">Region: North Region (Assigned)</p>
        </div>

        {/* Historical Date Picker Filter */}
        <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 px-3 py-2 rounded-xl">
          <Calendar className="w-4 h-4 text-sky-400" />
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="bg-transparent text-sm focus:outline-none text-slate-200"
          />
        </div>
      </header>

      {/* Delinquency & Metric Counter */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400 font-medium">Delinquency Count</p>
            <p className="text-2xl font-bold text-rose-400">{delinquentCount} Campuses</p>
          </div>
          <AlertOctagon className="w-8 h-8 text-rose-400/80" />
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400 font-medium">Pending Verifications</p>
            <p className="text-2xl font-bold text-amber-400">
              {submissions.filter((s) => s.status === 'pending').length}
            </p>
          </div>
          <Filter className="w-8 h-8 text-amber-400/80" />
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400 font-medium">Verified Assemblies</p>
            <p className="text-2xl font-bold text-emerald-400">
              {submissions.filter((s) => s.status === 'verified').length}
            </p>
          </div>
          <CheckCircle2 className="w-8 h-8 text-emerald-400/80" />
        </div>
      </section>

      {/* Verification Photo Grid */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-200">Daily Verification Photo Grid</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {submissions.map((sub) => (
            <div
              key={sub.id}
              className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden flex flex-col justify-between"
            >
              <div className="relative">
                <img src={sub.photoUrl} alt={sub.campusName} className="w-full h-48 object-cover" />
                {sub.isLate && (
                  <span className="absolute top-3 right-3 bg-rose-500/90 text-white text-xs font-semibold px-2.5 py-1 rounded-full flex items-center gap-1 backdrop-blur-md">
                    <AlertTriangle className="w-3 h-3" /> Late Submission
                  </span>
                )}
              </div>

              <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                <div>
                  <h3 className="font-bold text-slate-100">{sub.campusName}</h3>
                  <p className="text-xs text-slate-400">Code: {sub.campusCode} • Time: {sub.submittedAt}</p>
                </div>

                {/* 1-Click Verification Actions */}
                <div className="flex gap-2 pt-2 border-t border-slate-800">
                  <button
                    onClick={() => handleAction(sub.id, 'verified')}
                    className={`flex-1 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1 transition-colors ${
                      sub.status === 'verified'
                        ? 'bg-emerald-500 text-slate-950'
                        : 'bg-slate-800 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Verify
                  </button>

                  <button
                    onClick={() => handleAction(sub.id, 'flagged')}
                    className={`flex-1 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1 transition-colors ${
                      sub.status === 'flagged'
                        ? 'bg-rose-500 text-white'
                        : 'bg-slate-800 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30'
                    }`}
                  >
                    <AlertOctagon className="w-3.5 h-3.5" />
                    Flag
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
