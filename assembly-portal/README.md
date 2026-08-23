# Assembly Verification Portal (`assembly-portal`)

Multi-campus daily assembly monitoring web application built with **Next.js 14+ (App Router)** and **Supabase**.

## Tech Stack
- **Framework**: Next.js (App Router, TypeScript, `src/` directory layout)
- **Styling**: Tailwind CSS, Lucide React
- **Database & Storage**: Supabase (`@supabase/supabase-js`, `@supabase/ssr`)
- **Utilities**: `browser-image-compression`, `date-fns`, `clsx`, `tailwind-merge`

---

## Role-Based Architecture & Pages

1. **Principal Portal (`/principal`)**:
   - Mobile-first capture screen optimized for smartphones.
   - Rear/environment camera HTML5 trigger: `<input type="file" accept="image/*" capture="environment" />`.
   - Client-side WebP compression (<300 KB, max 1280px dimension) via `browser-image-compression`.
   - Direct storage uploads targeting Supabase Storage bucket `assembly-photos`.
   - Real-time status tracker (Submitted vs Pending, Late indicator for uploads after 10:30 AM).

2. **Finance Officer Portal (`/finance`)**:
   - Regionally scoped daily verification grid.
   - 1-click status actions ("Verify", "Flag").
   - Delinquency counter & non-compliant campus tracker.
   - Historical date picker filter.

3. **Regional Director Portal (`/director`)**:
   - Nationwide executive overview across all regions.
   - Top KPI cards: Total Campuses Nationwide, Total Assemblies Held, National Compliance %.
   - Comparative regional breakdown table with progress visualizers.
   - 1-click CSV export utility.

---

## Supabase Setup & Migrations

Database migration files are located under `supabase/migrations/`:
1. `001_initial_schema.sql`: Table structure for `regions`, `campuses`, `profiles`, and `assembly_submissions`.
2. `002_rls_policies.sql`: Row Level Security policies scoping reads/writes by role & region + bucket configuration.
3. `seed.sql`: Sample region and campus seed data.

### Environment Setup
Copy `.env.example` to `.env.local` and provide your Supabase credentials:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

---

## Development

```bash
# Install dependencies
npm install

# Run dev server
npm run dev
```
