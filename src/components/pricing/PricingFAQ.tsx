import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export const faqCategories = [
  {
    category: "Podcasts & Booking",
    faqs: [
      {
        question: "What kind of podcasts will I be on?",
        answer: "Shows that match your niche and have engaged audiences. We vet every show for quality and relevance before pitching you.",
      },
      {
        question: "What size podcasts will I be on?",
        answer: "It varies. We focus on relevance over size. A niche podcast with 5,000 engaged listeners in your industry is often more valuable than a general show with 50,000.",
      },
      {
        question: "How fast will I get booked?",
        answer: "Most clients see their first booking within 2-4 weeks. Episodes typically air 4-8 weeks after recording.",
      },
      {
        question: "Can I approve shows before you pitch me?",
        answer: "Absolutely. Your Podcast Command Center shows you every podcast we've hand-picked for you. You'll see AI-powered insights on why each show fits, audience demographics, and you approve or reject with one click. We only pitch shows YOU greenlight.",
      },
    ],
  },
  {
    category: "Command Center & Analytics",
    faqs: [
      {
        question: "What is the Podcast Command Center?",
        answer: "It's your personal dashboard where you control everything. See 50+ hand-picked podcasts curated for you, review AI-powered fit analysis, check audience demographics, and approve or reject shows before we pitch. No more mystery spreadsheets—full transparency.",
      },
      {
        question: "How does the AI analysis work?",
        answer: "Our AI reviews each podcast and explains exactly why it's a fit for your expertise and goals. You'll see talking points, audience insights, and potential pitch angles—so you can make informed decisions.",
      },
      {
        question: "What's included in reporting & analytics?",
        answer: "Track your entire podcast journey: shows booked, episodes recorded, episodes aired, total audience reach, and your campaign pipeline. Everything updates in real-time in your dashboard.",
      },
    ],
  },
  {
    category: "Pricing & Plans",
    faqs: [
      {
        question: "What's the difference between Starter and Pro?",
        answer: "Starter ($1,000/mo) gets you 2 podcast bookings per month plus full Command Center and analytics access. Pro ($1,500/mo) gets you 3+ bookings plus a full content package: 9 video clips, 2 blog posts, and a guest prep kit for every episode.",
      },
      {
        question: "Why the 3-month minimum?",
        answer: "Authority isn't built in 30 days. Podcast episodes take time to book, record, and air. The 3-month minimum ensures you see real results and build momentum.",
      },
      {
        question: "What's included in the Pro content package?",
        answer: "For every podcast episode: 9 short-form video clips (3 per podcast), 2 blog posts, and a guest prep kit so you show up confident. Everything is optimized for LinkedIn, Twitter, and repurposing.",
      },
      {
        question: "Can I upgrade from Starter to Pro?",
        answer: "Yes. You can upgrade at any time after your initial 3 months to get the full content package.",
      },
    ],
  },
];

interface PricingFAQProps {
  className?: string;
  variant?: 'default' | 'compact';
}

export function PricingFAQ({ className = '', variant = 'default' }: PricingFAQProps) {
  const isCompact = variant === 'compact';

  return (
    <div className={`${isCompact ? 'space-y-6' : 'space-y-10'} ${className}`}>
      {faqCategories.map((category, categoryIndex) => (
        <div key={categoryIndex}>
          <h3 className={`${isCompact ? 'text-xs' : 'text-sm'} font-semibold uppercase tracking-wider text-muted-foreground mb-4`}>
            {category.category}
          </h3>

          <Accordion type="single" collapsible className="w-full">
            {category.faqs.map((faq, index) => (
              <AccordionItem
                key={index}
                value={`${categoryIndex}-${index}`}
                className="border-border"
              >
                <AccordionTrigger className={`text-left text-foreground hover:no-underline hover:text-foreground/80 ${isCompact ? 'text-sm py-3' : ''}`}>
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className={`text-muted-foreground ${isCompact ? 'text-sm' : ''}`}>
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      ))}
    </div>
  );
}

export default PricingFAQ;
