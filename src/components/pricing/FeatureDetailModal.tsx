import { Button } from '@/components/ui/button';
import { Check } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

export type FeatureDetail = {
  title: string;
  description: string;
  details: string[];
  bestFor?: string;
  ctaLabel?: string;
  ctaHref?: string;
};

export const featureDetails: Record<string, FeatureDetail> = {
  'placement commitment': {
    title: 'Placement commitment',
    description:
      'The core plan is month-to-month and tied to delivery. If we miss the agreed monthly target, we keep working until the shortfall is made up.',
    bestFor:
      'Experts who want the outreach handled without losing approval control or visibility.',
    details: [
      'Minimum 2 podcast bookings per month',
      'Private client portal with approvals and status tracking',
      'Show research, outreach, and follow-up handled for you',
      'Guest prep support before each recording',
    ],
    ctaLabel: 'Book My Shortlist Call',
    ctaHref: 'https://calendly.com/getonapodjg/30min',
  },
  "2 podcast bookings/month": {
    title: "2 Podcast Bookings Per Month",
    description: "We secure 2 quality podcast appearances for you every month on shows that match your expertise and target audience.",
    details: [
      "Hand-picked shows relevant to your niche",
      "Vetted for audience engagement and quality",
      "Full scheduling coordination handled for you",
      "Episode prep support included",
    ],
  },
  "2 podcasts/month": {
    title: "2 Podcast Bookings Per Month",
    description: "We secure 2 quality podcast appearances for you every month on shows that match your expertise and target audience.",
    details: [
      "Hand-picked shows relevant to your niche",
      "Vetted for audience engagement and quality",
      "Full scheduling coordination handled for you",
      "Episode prep support included",
    ],
  },
  "2+ guaranteed podcast bookings every month": {
    title: "2+ Guaranteed Podcast Bookings Every Month",
    description: "We secure at least 2 podcast appearances each month on shows that match your expertise, audience fit, and positioning goals.",
    details: [
      "Curated shows selected for audience relevance",
      "Fit checked for quality and buyer alignment",
      "Full scheduling coordination handled for you",
      "Episode prep support included",
    ],
  },
  'Minimum 2 podcast bookings per month': {
    title: 'Minimum 2 podcast bookings per month',
    description:
      'Your plan includes a real monthly delivery target, focused on relevant podcasts instead of vanity reach.',
    details: [
      'We prioritize audience fit, host quality, and topic alignment',
      'You approve shows before outreach starts',
      'Scheduling and follow-up are handled for you',
      'If we miss the target, we keep working until the shortfall is made up',
    ],
  },
  "Minimum 3 bookings/month": {
    title: "Minimum 3 Bookings Per Month",
    description: "We guarantee at least 3 podcast appearances monthly, often more depending on availability and your approval queue.",
    details: [
      "3+ hand-picked shows relevant to your niche",
      "Vetted for audience engagement and quality",
      "Full scheduling coordination handled for you",
      "Episode prep support included",
    ],
  },
  "3+ podcasts/month": {
    title: "Minimum 3 Bookings Per Month",
    description: "We guarantee at least 3 podcast appearances monthly, often more depending on availability and your approval queue.",
    details: [
      "3+ hand-picked shows relevant to your niche",
      "Vetted for audience engagement and quality",
      "Full scheduling coordination handled for you",
      "Episode prep support included",
    ],
  },
  "Podcast Command Center access": {
    title: "Podcast Command Center",
    description: "Your private client portal where you can review shows, approve outreach, and track the campaign with full transparency.",
    details: [
      "Review curated podcasts before outreach starts",
      "AI-assisted fit analysis explains why each show belongs on your shortlist",
      "Approve or reject shows from one dashboard",
      "Track statuses, recordings, and publish dates in one place",
      "See the outreach pipeline without asking for updates",
    ],
  },
  "Podcast Command Center": {
    title: "Podcast Command Center",
    description: "Your private client portal where you can review shows, approve outreach, and track the campaign with full transparency.",
    details: [
      "Review curated podcasts before outreach starts",
      "AI-assisted fit analysis explains why each show belongs on your shortlist",
      "Approve or reject shows from one dashboard",
      "Track statuses, recordings, and publish dates in one place",
      "See the outreach pipeline without asking for updates",
    ],
  },
  'Private client portal with approvals and status tracking': {
    title: 'Private client portal',
    description:
      'Your dashboard keeps approvals, statuses, and campaign movement in one place so you do not have to chase updates.',
    details: [
      'Review recommended shows before any pitching begins',
      'Approve or reject targets from one client portal',
      'See what is pitched, booked, recorded, and publishing',
      'Track the campaign without relying on spreadsheets',
    ],
  },
  "Reporting & analytics dashboard": {
    title: "Reporting & Analytics Dashboard",
    description: "Track the campaign from first pitch to published episode with visibility into pipeline movement and delivery.",
    details: [
      "Shows pitched, booked, recorded, and published",
      "Episode status tracking and delivery visibility",
      "Campaign progress by stage",
      "A clearer view of what needs approval or attention",
      "Performance history inside the portal",
    ],
  },
  "Reporting & analytics": {
    title: "Reporting & Analytics Dashboard",
    description: "Track your podcast journey with real-time insights and metrics that show your campaign's performance.",
    details: [
      "Shows booked, recorded, and aired",
      "Total audience reach across all appearances",
      "Campaign progress and pipeline visibility",
      "Episode status tracking",
      "Performance trends over time",
    ],
  },
  'Show research, outreach, and follow-up handled for you': {
    title: 'Done-for-you outreach',
    description:
      'We handle the list building, pitching, and follow-up so the campaign keeps moving without becoming another internal project for your team.',
    details: [
      'Show research based on audience fit and positioning',
      'Personalized outreach written around your expertise',
      'Follow-up handled so promising opportunities do not stall',
      'Approval control stays with you before outreach begins',
    ],
  },
  "Guest prep kit": {
    title: "Guest Prep Kit",
    description: "Everything you need to show up confident and deliver your best performance on every podcast.",
    details: [
      "Host background and interview style",
      "Audience demographics and interests",
      "Suggested talking points tailored to the show",
      "Common questions the host asks",
      "Tips to maximize your appearance",
    ],
  },
  'Guest prep support before each recording': {
    title: 'Guest prep support',
    description:
      'Before each recording, we help you show up prepared with the context and angles needed to sound sharp on the episode.',
    details: [
      'Talking points tailored to the show and host',
      'Context on the audience and interview format',
      'Prep guidance to tighten your story and positioning',
      'Support so you sound ready, not rehearsed',
    ],
  },
};

interface FeatureDetailModalProps {
  selectedFeature: string | null;
  onClose: () => void;
}

export function FeatureDetailModal({ selectedFeature, onClose }: FeatureDetailModalProps) {
  const currentFeatureDetail = selectedFeature ? featureDetails[selectedFeature] : null;

  if (!currentFeatureDetail) {
    return null;
  }

  return (
    <Dialog open={!!selectedFeature} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="mx-4 max-w-xl rounded-[28px] border border-[#0d1b2a]/10 bg-[#fffdf9] p-0 shadow-[0_24px_55px_rgba(13,27,42,0.16)] sm:mx-auto">
        <div className="p-6 sm:p-7">
          <DialogHeader className="pr-8">
            <DialogTitle className="font-display text-2xl font-semibold tracking-[-0.04em] text-[#0d1b2a] sm:text-3xl">
              {currentFeatureDetail.title}
            </DialogTitle>
            <DialogDescription className="pt-3 text-sm leading-7 text-[#54473d] sm:text-base">
              {currentFeatureDetail.description}
            </DialogDescription>
          </DialogHeader>

          {currentFeatureDetail.bestFor ? (
            <div className="mt-6 rounded-[22px] border border-[#0d1b2a]/8 bg-[#fff3e8] p-5">
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#7a6554]">
                Best for
              </p>
              <p className="mt-2 text-sm leading-7 text-[#3f342c] sm:text-base">
                {currentFeatureDetail.bestFor}
              </p>
            </div>
          ) : null}

          <div className="mt-6">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#7a6554]">
              What&apos;s included
            </p>

            <ul className="mt-4 space-y-3">
              {currentFeatureDetail.details.map((detail, i) => (
                <li
                  key={i}
                  className="flex items-start gap-3 rounded-[18px] border border-[#0d1b2a]/8 bg-white px-4 py-4"
                >
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#b46a3c]" />
                  <span className="text-sm leading-7 text-[#3f342c]">{detail}</span>
                </li>
              ))}
            </ul>
          </div>

          {currentFeatureDetail.ctaHref && currentFeatureDetail.ctaLabel ? (
            <div className="mt-6">
              <Button variant="hero" size="lg" className="w-full rounded-full px-7 sm:w-auto" asChild>
                <a href={currentFeatureDetail.ctaHref} target="_blank" rel="noopener noreferrer">
                  {currentFeatureDetail.ctaLabel}
                </a>
              </Button>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default FeatureDetailModal;
