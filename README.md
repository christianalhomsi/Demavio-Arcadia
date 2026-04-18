# Arcadia - Gaming Hub Management System

A comprehensive gaming hall management system built with Next.js 15, Supabase, and TypeScript.

## Features

- 🎮 **Multi-Hall Management** - Manage multiple gaming halls from one platform
- 📅 **Reservation System** - Book gaming sessions with real-time availability
- 💰 **Financial Management** - Track transactions, cash registers, and audit logs
- 👥 **User Management** - Role-based access control (Admin, Manager, Staff, Player)
- 🌐 **Multi-language Support** - Arabic (default) and English
- 📧 **OTP Authentication** - Secure login with email verification
- 🎯 **Agent System** - Remote device management and control
- 📊 **Dashboard & Analytics** - Real-time insights and reporting

## Tech Stack

- **Framework:** Next.js 15 (App Router)
- **Language:** TypeScript
- **Database:** Supabase (PostgreSQL)
- **Authentication:** Supabase Auth + Custom OTP
- **Styling:** Tailwind CSS 4
- **UI Components:** Shadcn/ui
- **State Management:** TanStack Query
- **Email:** Nodemailer (Gmail SMTP)
- **Internationalization:** next-intl

## Getting Started

### Prerequisites

- Node.js 20+
- npm or yarn
- Supabase account
- Gmail account with App Password

### Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd gaming-hub
```

2. Install dependencies:
```bash
npm install
```

3. Copy environment variables:
```bash
cp .env.example .env.local
```

4. Configure your `.env.local` file with your credentials

5. Run the development server:
```bash
npm run dev
```

6. Open [http://localhost:3000](http://localhost:3000)

## Environment Variables

See `.env.example` for required environment variables.

### Gmail SMTP Setup

1. Enable 2-Step Verification in your Google Account
2. Go to [App Passwords](https://myaccount.google.com/apppasswords)
3. Generate a new app password for "Mail"
4. Use the 16-character password in `SMTP_PASSWORD`

## Project Structure

```
├── app/                    # Next.js app directory
│   ├── [locale]/          # Internationalized routes
│   ├── api/               # API routes
│   └── globals.css        # Global styles
├── components/            # React components
├── lib/                   # Utility functions
├── services/              # Business logic
├── types/                 # TypeScript types
├── messages/              # i18n translations
└── supabase/             # Database migrations
```

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

## License

Private - All rights reserved

## Support

For support, contact the development team.
