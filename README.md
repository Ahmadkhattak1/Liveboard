# Liveboard

A real-time collaborative canvas application inspired by Miro, with a minimalist design aesthetic inspired by RemoteOk.com.

## Features (Phase 1 Complete)

- Next.js 14 with App Router
- TypeScript for type safety
- Tailwind CSS with custom RemoteOk-inspired theme
- Firebase integration (Auth, Realtime Database, Storage)
- Light/Dark mode toggle
- Responsive design
- Emoji-based iconography

## Getting Started

### Prerequisites

- Node.js 18+ installed
- Firebase project created
- npm or yarn package manager

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd Liveboard
```

2. Install dependencies:
```bash
npm install
```

3. Set up Firebase:
   - Create a Firebase project at https://console.firebase.google.com
   - Enable Authentication, Realtime Database, and Storage
   - Copy `.env.local.example` to `.env.local`
   - Fill in your Firebase credentials

4. Run the development server:
```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser

## Project Structure

```
liveboard/
├── src/
│   ├── app/                      # Next.js App Router pages
│   ├── components/
│   │   ├── ui/                   # Reusable UI components
│   │   └── providers/            # React Context providers
│   ├── lib/
│   │   ├── firebase/             # Firebase configuration and utilities
│   │   ├── constants/            # App constants and tools
│   │   └── utils/                # Utility functions
│   └── types/                    # TypeScript type definitions
├── public/                       # Static assets
└── package.json
```

## Tech Stack

- **Framework**: Next.js 14
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Canvas**: Fabric.js (to be implemented in Phase 2)
- **Backend**: Firebase (Auth, Realtime Database, Storage)
- **State Management**: React Context
- **ID Generation**: nanoid

## Development Phases

### Phase 1: Foundation ✅ (Complete)
- Project setup and configuration
- TypeScript types and utilities
- Firebase integration
- UI components library
- Theme system
- Basic routing

### Phase 2: Canvas Core (Next)
- Fabric.js canvas implementation
- Drawing tools (pen, shapes, text, images)
- Canvas controls (zoom, pan)
- Toolbar UI

### Phase 3: Real-time Sync
- Firebase Realtime Database integration
- Canvas object synchronization
- Conflict resolution

### Phase 4: Collaboration
- User presence tracking
- Cursor synchronization
- Active users display

### Phase 5: Polish
- Mobile responsiveness
- Keyboard shortcuts
- Performance optimization
- Error handling

## Environment Variables

See `.env.local.example` for required environment variables.

## Firebase Setup

1. Create a Firebase project
2. Enable Authentication:
   - Email/Password provider
   - Anonymous authentication
3. Create Realtime Database:
   - Start in locked mode
4. Enable Storage:
   - Set up for image uploads
5. Deploy security rules:
   - `npx firebase-tools deploy --only database,firestore:rules,storage`

## Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run lint` - Run ESLint
- `npm run type-check` - Run TypeScript type checking

## Design Principles

- **Minimalist**: Clean, functional design without unnecessary elements
- **Emoji-based**: Use emojis instead of traditional icons where possible
- **Accessible**: Support for light/dark modes, keyboard navigation
- **Responsive**: Mobile-first design approach

## Contributing

This is a work in progress. Check the plan file for implementation details.

## License

MIT
