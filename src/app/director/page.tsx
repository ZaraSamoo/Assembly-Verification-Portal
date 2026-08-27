'use client';

import React, { useState } from 'react';
import { Download, Building2, CheckCircle2, TrendingUp, Calendar, Clock, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';

interface RegionalBreakdown {
  region: string;
  totalCampuses: number;
  assembliesHeld: number;
  compliancePct: number;
}

const REGIONAL_DATA: RegionalBreakdown[] = [
  { region: 'North Region', totalCampuses: 20, assembliesHeld: 0, compliancePct: 0.0 },
  { region: 'South Region', totalCampuses: 25, assembliesHeld: 0, compliancePct: 0.0 },
  { region: 'Central Region', totalCampuses: 16, assembliesHeld: 0, compliancePct: 0.0 },
];

export default function RegionalDirectorPortal() {
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [isLive, setIsLive] = useState(true);

  const exportCSV = () => {
    const headers = 'Region,Total Campuses,Assemblies Held,Compliance Pct\n';
    const rows = REGIONAL_DATA.map(
      (r) => `"${r.region}",${r.totalCampuses},${r.assembliesHeld},${r.compliancePct}%`
    ).join('\n');
    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `assembly-audit-report-${selectedDate}.csv`;
    a.click();
  };

  const totalColleges = 61;
  const submittedToday = 0;
  const submittedPct = 0;
  const pendingMissing = 61;
  const complianceRate = 0.0;

  return (
    <main className="min-h-screen bg-[#09090b] text-slate-100 font-sans">
      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* Header & Controls Bar */}
        <header className="border border-slate-800 bg-slate-900/60 backdrop-blur rounded-xl p-4 sm:p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold tracking-wider text-slate-400 uppercase">
              <span>Government of Sindh</span>
              <span>•</span>
              <span>College Education Department</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-100 mt-1">
              Regional Director Overview
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Modernized Date Picker */}
            <div className="flex items-center gap-2 border border-slate-800 bg-slate-900/80 px-3.5 py-2 rounded-lg text-xs font-medium text-slate-200 shadow-sm focus-within:border-slate-700 transition-colors">
              <Calendar className="w-4 h-4 text-slate-400" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-transparent outline-none text-slate-100 cursor-pointer"
              />
            </div>

            {/* Live Feed Toggle / Status Button */}
            <button
              type="button"
              onClick={() => setIsLive(!isLive)}
              className="flex items-center gap-2 px-3.5 py-2 border border-slate-800 bg-slate-900/80 hover:bg-slate-800/60 text-slate-300 hover:text-slate-100 rounded-lg text-xs font-medium transition-colors shadow-sm cursor-pointer"
            >
              <span className="relative flex h-2 w-2">
                <span className={`absolute inset-0 rounded-full bg-emerald-400 ${isLive ? 'animate-ping opacity-75' : 'opacity-0'}`} />
                <span className={`relative h-2 w-2 rounded-full ${isLive ? 'bg-emerald-400' : 'bg-slate-500'}`} />
              </span>
              Live Feed
            </button>

            {/* Export Audit CSV Button */}
            <button
              onClick={exportCSV}
              className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-white text-slate-900 rounded-lg text-xs font-semibold transition-colors shadow-sm cursor-pointer"
            >
              <Download className="w-4 h-4 text-slate-900" />
              Export Audit CSV
            </button>
          </div>
        </header>

        {/* 4-Column Metric / KPI Cards Grid */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Total Colleges */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 backdrop-blur p-5 shadow-sm hover:border-slate-700 transition-colors flex flex-col justify-between space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold tracking-wider text-slate-400 uppercase">Total Colleges</span>
              <div className="p-2 rounded-lg bg-slate-800/60 border border-slate-700/50 text-slate-400">
                <Building2 className="w-4 h-4" />
              </div>
            </div>
            <div>
              <p className="text-2xl font-bold tracking-tight text-slate-100">{totalColleges}</p>
              <p className="text-xs text-slate-400 mt-1">Registered Campuses</p>
            </div>
          </div>

          {/* Card 2: Submitted Today */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 backdrop-blur p-5 shadow-sm hover:border-slate-700 transition-colors flex flex-col justify-between space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold tracking-wider text-slate-400 uppercase">Submitted Today</span>
              <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <div>
              <p className="text-2xl font-bold tracking-tight text-slate-100">
                {submittedToday} <span className="text-xs font-semibold text-slate-400">({submittedPct}%)</span>
              </p>
              <p className="text-xs text-slate-400 mt-1">Verified Logged Photos</p>
            </div>
          </div>

          {/* Card 3: Pending / Missing */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 backdrop-blur p-5 shadow-sm hover:border-slate-700 transition-colors flex flex-col justify-between space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold tracking-wider text-slate-400 uppercase">Pending / Missing</span>
              <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <div>
              <p className="text-2xl font-bold tracking-tight text-amber-400">{pendingMissing}</p>
              <p className="text-xs text-slate-400 mt-1">Awaiting Verification</p>
            </div>
          </div>

          {/* Card 4: Compliance Rate */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 backdrop-blur p-5 shadow-sm hover:border-slate-700 transition-colors flex flex-col justify-between space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold tracking-wider text-slate-400 uppercase">Compliance Rate</span>
              <div className="p-2 rounded-lg bg-slate-800/60 border border-slate-700/50 text-slate-400">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
            <div>
              <p className="text-2xl font-bold tracking-tight text-slate-100">{complianceRate.toFixed(1)}%</p>
              <p className="text-xs text-slate-400 mt-1">{submittedToday} of {totalColleges} colleges</p>
            </div>
          </div>
        </section>

        {/* Regional Breakdown Table Section */}
        <section className="rounded-xl border border-slate-800 bg-slate-900/60 backdrop-blur p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <h2 className="text-base font-semibold text-slate-100">Regional Performance Breakdown</h2>
              <p className="text-xs text-slate-400 mt-0.5">Summary status by sub-division administrative region</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  <th className="py-3 px-4">Region</th>
                  <th className="py-3 px-4">Total Campuses</th>
                  <th className="py-3 px-4">Assemblies Held</th>
                  <th className="py-3 px-4">Compliance Progress</th>
                  <th className="py-3 px-4">Compliance %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-xs text-slate-200">
                {REGIONAL_DATA.map((row) => (
                  <tr key={row.region} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-4 px-4 font-semibold text-slate-100">{row.region}</td>
                    <td className="py-4 px-4 text-slate-300">{row.totalCampuses}</td>
                    <td className="py-4 px-4 text-slate-300">{row.assembliesHeld}</td>
                    <td className="py-4 px-4 w-1/3">
                      <div className="w-full bg-slate-950 rounded-full h-2 border border-slate-800 overflow-hidden">
                        <div
                          className="bg-emerald-500 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${row.compliancePct}%` }}
                        />
                      </div>
                    </td>
                    <td className="py-4 px-4 font-bold text-slate-100">{row.compliancePct.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}

