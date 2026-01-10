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
};

export const featureDetails: Record<string, FeatureDetail> = {
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
    description: "Your personal dashboard where you control your entire podcast campaign with full transparency.",
    details: [
      "See 50+ hand-picked podcasts curated for you",
      "AI-powered analysis explains why each show fits",
      "View audience demographics per podcast",
      "Approve or reject shows with one click",
      "Track your pipeline in real-time",
    ],
  },
  "Podcast Command Center": {
    title: "Podcast Command Center",
    description: "Your personal dashboard where you control your entire podcast campaign with full transparency.",
    details: [
      "See 50+ hand-picked podcasts curated for you",
      "AI-powered analysis explains why each show fits",
      "View audience demographics per podcast",
      "Approve or reject shows with one click",
      "Track your pipeline in real-time",
    ],
  },
  "Reporting & analytics dashboard": {
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
  "2 blog posts per episode": {
    title: "2 Blog Posts Per Episode",
    description: "Professional blog content created from each podcast episode, ready to publish on your website or LinkedIn.",
    details: [
      "Written by professional content writers",
      "SEO-optimized for your target keywords",
      "Captures key insights from your conversation",
      "Formatted and ready to publish",
      "Extends the life of your podcast appearance",
    ],
  },
  "2 blog posts/episode": {
    title: "2 Blog Posts Per Episode",
    description: "Professional blog content created from each podcast episode, ready to publish on your website or LinkedIn.",
    details: [
      "Written by professional content writers",
      "SEO-optimized for your target keywords",
      "Captures key insights from your conversation",
      "Formatted and ready to publish",
      "Extends the life of your podcast appearance",
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
  "9 video clips (3 per podcast)": {
    title: "9 Short-Form Video Clips",
    description: "Professional video clips created from your podcast appearances, optimized for social media.",
    details: [
      "3 clips per podcast episode",
      "Edited with captions and branding",
      "Optimized for LinkedIn, Twitter, Instagram",
      "Vertical and horizontal formats available",
      "Ready to post immediately",
    ],
  },
  "9 video clips/month": {
    title: "9 Short-Form Video Clips",
    description: "Professional video clips created from your podcast appearances, optimized for social media.",
    details: [
      "3 clips per podcast episode",
      "Edited with captions and branding",
      "Optimized for LinkedIn, Twitter, Instagram",
      "Vertical and horizontal formats available",
      "Ready to post immediately",
    ],
  },
};

interface FeatureDetailModalProps {
  selectedFeature: string | null;
  onClose: () => void;
}

export function FeatureDetailModal({ selectedFeature, onClose }: FeatureDetailModalProps) {
  const currentFeatureDetail = selectedFeature ? featureDetails[selectedFeature] : null;

  return (
    <Dialog open={!!selectedFeature} onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">
            {currentFeatureDetail?.title}
          </DialogTitle>
          <DialogDescription className="text-base pt-2">
            {currentFeatureDetail?.description}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4">
          <p className="text-sm font-medium text-foreground mb-3">What's included:</p>
          <ul className="space-y-2">
            {currentFeatureDetail?.details.map((detail, i) => (
              <li key={i} className="flex items-start gap-3">
                <Check className="w-4 h-4 flex-shrink-0 mt-0.5 text-primary" />
                <span className="text-sm text-muted-foreground">{detail}</span>
              </li>
            ))}
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default FeatureDetailModal;
