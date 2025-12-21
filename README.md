# Authority Lab - Podcast Placement + PR for Founders

A modern, conversion-focused landing page for Authority Lab, offering done-for-you podcast placement and PR services.

## 🚀 Project Overview

Authority Lab helps founders and financial professionals build authority through podcast appearances and press features. This site implements a complete revenue ladder architecture based on the Matt Larsson flywheel framework, capturing leads from free resources to premium $4K/month services.

## 📁 Site Structure

### Pages

- **Homepage (`/`)** - Main landing page with 15 sections
- **Resources (`/resources`)** - Lead Magnet Hub with 6 free downloads
- **Premium Placements (`/premium-placements`)** - Exclusive podcast placement menu
- **Course (`/course`)** - Coming soon page for DIY course with waitlist

### Homepage Sections (in order)

1. **Hero** - Main value proposition with CTAs
2. **Problem** - 5 pain points prospects face
3. **Solution** - "What if someone did it for you?"
4. **How It Works** - 4-step process
5. **What You Get** - 4 key features/deliverables
6. **Podcast Showcase** - Visual display of 150+ placements across 16+ shows
7. **Pricing** - 3 tiers (Starter $1K, Growth $2K, Pro $4K)
8. **Why Pro** - Explains premium tier (podcasts + PR)
9. **Who It's For** - Target audience definition
10. **Case Studies** - 3 detailed results with metrics
11. **Social Proof** - Testimonials
12. **Lead Magnet** - Email capture
13. **FAQ** - Accordion-based Q&A
14. **Final CTA** - "Ready to stop being a secret?"
15. **Footer** - Navigation and legal

## 🛠️ Tech Stack

- **Framework:** React 18 + TypeScript
- **Build Tool:** Vite 5.4
- **Styling:** Tailwind CSS 3.4 with custom theme
- **UI Components:** shadcn/ui (51 components)
- **Routing:** React Router DOM
- **Forms:** React Hook Form + Zod validation
- **Icons:** Lucide React
- **Animations:** Intersection Observer via custom hook

## 📦 Installation & Setup

```bash
# Clone the repository
git clone https://github.com/jonathangetonapod/authority-built

# Navigate to project
cd authority-built

# Install dependencies
npm install

# Start development server
npm run dev
```

The site will be available at `http://localhost:8080`

## 🎨 Customization Guide

### Priority 1: Replace Placeholder Content

#### 1. Podcast Showcase
**File:** `src/components/PodcastShowcaseSection.tsx` (line 7)
- Replace placeholder podcast names with real shows
- Update stats (Total Placements, Combined Reach, Shows Partnered)
- Add real logos if available

#### 2. Case Studies
**File:** `src/components/CaseStudiesSection.tsx` (line 7)
- Replace with actual client results
- Update names, titles, industries, metrics
- Use real testimonial quotes

#### 3. Premium Placements
**File:** `src/pages/PremiumPlacements.tsx` (line 11)
- Update with your actual guaranteed shows
- Set real pricing, audience sizes, features
- Add podcast logos/images

#### 4. Lead Magnets
**File:** `src/pages/Resources.tsx` (line 10)
- Connect to email service (ConvertKit, Mailchimp, etc.)
- Add real download links when files are ready
- Update descriptions as needed

#### 5. Course Page
**File:** `src/pages/Course.tsx`
- Update course title and timeline
- Modify module content
- Set real launch date

### Priority 2: Email Integration

Currently, all forms show toast notifications. To connect to your email service:

1. Install email service SDK (e.g., `@convertkit/convertkit-react`)
2. Update form handlers in:
   - `src/pages/Resources.tsx` (handleDownload function)
   - `src/pages/Course.tsx` (handleJoinWaitlist function)
   - `src/components/LeadMagnetSection.tsx`

### Priority 3: Analytics & Tracking

Add tracking to:
- Button clicks ("Book a Call", downloads)
- Page views
- Form submissions

## 🎯 Revenue Ladder Architecture

This site implements a complete funnel:

1. **Free ($0)** - 6 lead magnets on `/resources`
2. **Course ($497)** - Coming soon on `/course`
3. **One-time ($1,500)** - Podcast Launch Sprint (to be added)
4. **Starter ($1K/mo)** - 2 podcasts/month
5. **Growth ($2K/mo)** - 4 podcasts/month
6. **Pro ($4K/mo)** - 4 podcasts + done-for-you PR
7. **Premium Placements** - À la carte guaranteed spots

## 📊 Key Features

- ✅ Fully responsive design (mobile-first)
- ✅ Scroll-based animations (Intersection Observer)
- ✅ SEO-friendly structure
- ✅ Fast performance (Vite + React SWC)
- ✅ Type-safe (TypeScript)
- ✅ Accessible (shadcn/ui components)
- ✅ Dark mode ready (theme system in place)

## 🚀 Deployment

### Option 1: Vercel (Recommended)
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel
```

### Option 2: Netlify
```bash
# Build
npm run build

# Deploy dist/ folder to Netlify
```

### Option 3: Manual
```bash
# Build production bundle
npm run build

# Upload dist/ folder to your hosting
```

## 📝 Available Scripts

- `npm run dev` - Start development server (port 8080)
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

## 🔧 Configuration Files

- `vite.config.ts` - Vite configuration
- `tailwind.config.ts` - Tailwind theme customization
- `tsconfig.json` - TypeScript configuration
- `components.json` - shadcn/ui configuration

## 📚 Documentation

- [React Documentation](https://react.dev)
- [Tailwind CSS](https://tailwindcss.com/docs)
- [shadcn/ui](https://ui.shadcn.com)
- [Vite](https://vitejs.dev)

## 🤝 Contributing

This is a private project for Authority Lab. For questions or support:
- Email: support@authoritylab.com
- GitHub Issues: [Report an issue](https://github.com/jonathangetonapod/authority-built/issues)

## 📄 License

Private - All Rights Reserved

---

Built with [Claude Code](https://claude.com/claude-code) and [Lovable](https://lovable.dev)
