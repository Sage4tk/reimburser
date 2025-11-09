# Reimburse Frontend

A modern expense reimbursement app built with React, TypeScript, Vite, Zustand, Supabase, shadcn UI, and Tailwind CSS.

## Features

- **Authentication**: Email/password login & registration via Supabase Auth, with persistent session using Zustand.
- **Expense Management**: Add, edit, and delete expenses. Only current month's expenses are shown by default.
- **Receipt Uploads**: Upload, preview, and delete multiple receipt images per expense. Images are securely stored in Supabase Storage, organized by user and expense.
- **Validation**: All forms use Zod for robust input validation.
- **Mobile Friendly**: Responsive UI with mobile-optimized dialogs and controls.
- **Security**: Private storage bucket, signed URLs for receipts, and strict Row Level Security (RLS) policies.
- **User Experience**: Fast, modern UI with shadcn components and Tailwind CSS.

## Tech Stack

- **React 19 + TypeScript**
- **Vite** (dev/build tool)
- **Supabase** (auth, database, storage)
- **Zustand** (state management)
- **shadcn/ui** (UI components)
- **Tailwind CSS** (utility-first styling)
- **Zod** (form validation)

## Getting Started

### 1. Clone & Install

```sh
git clone https://github.com/your-username/reimburse-frontend.git
cd reimburse-frontend
npm install
```

### 2. Environment Variables

Create a `.env` file in the project root:

```
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Get these values from your Supabase project dashboard.

### 3. Run the App

```sh
npm run dev
```

The app will be available at [http://localhost:5173](http://localhost:5173).

## Supabase Setup

- **Auth**: Enable Email provider in Supabase Auth settings.
- **Database**: Create `expense` and `receipt` tables (see `src/lib/database.types.ts` for schema).
- **Storage**: Create a private bucket named `receipts`. Set up RLS and storage policies so users can only access their own files. See `RECEIPT_SETUP.md` for detailed SQL and policy setup.

## File Structure

- `src/components/ExpenseTable.tsx` — Main expense and receipt management UI
- `src/components/LoginPage.tsx` — Auth UI
- `src/store/authStore.ts` — Zustand auth/session store
- `src/lib/supabase.ts` — Supabase client
- `src/lib/database.types.ts` — Database types

## Receipt Storage Structure

```
receipts/
  {user_id}/
    {expense_id}/
      {timestamp}.{ext}
```

## Security

- All receipt files are private and accessed via signed URLs.
- RLS policies ensure users can only access their own data.
- Deleting an expense also deletes its receipts.

## Contributing

PRs and issues welcome!

---

For more details, see `AUTH_SETUP.md` and `RECEIPT_SETUP.md`.

---
