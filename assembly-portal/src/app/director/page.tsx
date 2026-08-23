'use client';

import React, { useState } from 'react';
import { Download, Building2, CheckCircle2, TrendingUp, Calendar, Globe } from 'lucide-react';
import { format } from 'date-fns';

interface RegionalBreakdown {
  region: string;
  totalCampuses: number;
  assembliesHeld: number;
  compliancePct: number;
}

const REGIONAL_DATA: RegionalBreakdown[] = [
  { region: 'North Region', totalCampuses: 45, assembliesHeld: 42, compliancePct: 93.3 },
  { region: 'South Region', totalCampuses: 50, assembliesHeld: 48, compliancePct: 96.0 },
  { region: 'Central Region', totalCampuses: 35, assembliesHeld: 30, compliancePct: 85.7 },
];

export default function RegionalDirectorPortal() {
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  const exportCSV = () => {
    const headers = 'Region,Total Campuses,Assemblies Held,Compliance Pct\n';
    const rows = REGIONAL_DATA.map(
      (r) => `"${r.region}",${r.totalCampuses},${r.assembliesHeld},${r.compliancePct}%`
    ).join('\n');
    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `assembly-report-${selectedDate}.csv`;
    a.click();
  };

  const totalCampusesNationwide = REGIONAL_DATA.reduce((acc, curr) => acc + curr.totalCampuses, 0);
  const totalAssembliesHeld = REGIONAL_DATA.reduce((acc, curr) => acc + curr.assembliesHeld, 0);
  const nationalCompliancePct = ((totalAssembliesHeld / totalCampusesNationwide) * 100).toFixed(1);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 pb-4 border-b border-slate-800">
        <div>
          <h1 className="text-2xl font-bold text-indigo-400">Executive Director Overview</h1>
          <p className="text-sm text-slate-400">Nationwide Multi-Campus Daily Assembly Monitoring</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 px-3 py-2 rounded-xl">
            <Calendar className="w-4 h-4 text-indigo-400" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent text-sm focus:outline-none text-slate-200"
            />
          </div>

          {/* 1-Click CSV Export Utility */}
          <button
            onClick={exportCSV}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold transition-colors shadow-lg shadow-indigo-600/20"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </header>

      {/* Top KPI Metric Cards */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400 font-medium">Total Campuses Nationwide</p>
            <p className="text-3xl font-extrabold text-slate-100 mt-1">{totalCampusesNationwide}</p>
          </div>
          <Building2 className="w-10 h-10 text-indigo-400/80" />
        </div>

        <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400 font-medium">Total Assemblies Held</p>
            <p className="text-3xl font-extrabold text-emerald-400 mt-1">{totalAssembliesHeld}</p>
          </div>
          <CheckCircle2 className="w-10 h-10 text-emerald-400/80" />
        </div>

        <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400 font-medium">National Compliance %</p>
            <p className="text-3xl font-extrabold text-sky-400 mt-1">{nationalCompliancePct}%</p>
          </div>
          <TrendingUp className="w-10 h-10 text-sky-400/80" />
        </div>
      </section>

      {/* Comparative Regional Breakdown Table */}
      <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <h2 className="text-lg font-semibold text-slate-100 mb-4 flex items-center gap-2">
          <Globe className="w-5 h-5 text-indigo-400" />
          Comparative Regional Performance
        </h2>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-xs text-slate-400 uppercase tracking-wider">
                <th className="py-3 px-4">Region</th>
                <th className="py-3 px-4">Total Campuses</th>
                <th className="py-3 px-4">Assemblies Held</th>
                <th className="py-3 px-4">Compliance Progress</th>
                <th className="py-3 px-4">Compliance %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-sm">
              {REGIONAL_DATA.map((row) => (
                <tr key={row.region} className="hover:bg-slate-800/30 transition-colors">
                  <td className="py-4 px-4 font-semibold text-slate-200">{row.region}</td>
                  <td className="py-4 px-4 text-slate-300">{row.totalCampuses}</td>
                  <td className="py-4 px-4 text-slate-300">{row.assembliesHeld}</td>
                  <td className="py-4 px-4 w-1/3">
                    {/* Visual Progress Bar */}
                    <div className="w-full bg-slate-950 rounded-full h-2.5 border border-slate-800 overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-indigo-500 to-emerald-400 h-2.5 rounded-full"
                        style={{ width: `${row.compliancePct}%` }}
                      ></div>
                    </div>
                  </td>
                  <td className="py-4 px-4 font-bold text-slate-100">{row.compliancePct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
