# Authentication Setup

This project uses Supabase for authentication and Zustand for state management.

## Setup Instructions

### 1. Environment Variables

Create a `.env` file in the root directory with your Supabase credentials:

```env
VITE_SUPABASE_URL=your_supabase_url_here
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key_here
```

You can find these values in your Supabase project settings.

### 2. Features Implemented

- **Authentication Store** (`src/store/authStore.ts`)

  - Zustand store with persistence
  - Sign in and sign up functionality
  - Session management
  - Auto-initialization on app load
  - Auth state listener for real-time updates

- **Login Page** (`src/components/LoginPage.tsx`)

  - Tabbed interface for Sign In and Sign Up
  - Form validation
  - Error handling
  - Loading states
  - Built with shadcn UI components

- **Dashboard** (`src/components/Dashboard.tsx`)

  - Protected route (only accessible when authenticated)
  - Displays user information
  - Sign out functionality

- **App Component** (`src/App.tsx`)
  - Auth initialization on mount
  - Conditional rendering based on auth state
  - Loading spinner during initialization

### 3. Usage

The auth system will automatically:

- Initialize on app load
- Restore session from localStorage
- Listen for auth state changes
- Redirect to login if not authenticated
- Show dashboard when authenticated

### 4. Supabase Setup

Make sure you have enabled Email authentication in your Supabase project:

1. Go to Authentication > Providers
2. Enable Email provider
3. Configure email templates (optional)
4. Set up email confirmation settings

### 5. State Persistence

The auth state is persisted to localStorage automatically using Zustand's persist middleware. The following data is stored:

- User object
- Session object

This means users will stay logged in even after refreshing the page or closing the browser.
