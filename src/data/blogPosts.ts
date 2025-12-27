export interface BlogPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  author: string;
  publishedAt: string;
  category: string;
  tags: string[];
  imageUrl: string;
  readTime: string;
}

export const blogPosts: BlogPost[] = [
  {
    id: '1',
    slug: 'why-podcast-guesting-beats-paid-ads',
    title: 'Why Podcast Guesting Beats Paid Ads for B2B Lead Generation',
    excerpt: 'Discover why appearing on podcasts generates 3x more qualified leads than traditional paid advertising channels, at a fraction of the cost.',
    content: '',
    author: 'Get On A Pod Team',
    publishedAt: '2025-01-08',
    category: 'Podcast Marketing',
    tags: ['Lead Generation', 'B2B Marketing', 'Podcasting'],
    imageUrl: 'https://images.unsplash.com/photo-1590602847861-f357a9332bbc?w=800&h=500&fit=crop',
    readTime: '5 min read'
  },
  {
    id: '2',
    slug: 'how-to-prepare-for-podcast-interview',
    title: 'The Ultimate Podcast Guest Prep Checklist: 15 Steps to Nail Every Interview',
    excerpt: 'From audio setup to storytelling frameworks, this comprehensive guide ensures you deliver value and convert listeners into customers.',
    content: '',
    author: 'Get On A Pod Team',
    publishedAt: '2025-01-06',
    category: 'Guest Tips',
    tags: ['Interview Tips', 'Public Speaking', 'Preparation'],
    imageUrl: 'https://images.unsplash.com/photo-1478737270239-2f02b77fc618?w=800&h=500&fit=crop',
    readTime: '8 min read'
  },
  {
    id: '3',
    slug: 'podcast-roi-calculator',
    title: 'The Real ROI of Podcast Guesting: A Data-Driven Analysis',
    excerpt: 'We analyzed 500+ podcast appearances to reveal the average return on investment, including lead quality, brand reach, and conversion rates.',
    content: '',
    author: 'Get On A Pod Team',
    publishedAt: '2025-01-04',
    category: 'Strategy',
    tags: ['ROI', 'Analytics', 'Case Studies'],
    imageUrl: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800&h=500&fit=crop',
    readTime: '6 min read'
  },
  {
    id: '4',
    slug: 'best-podcasts-for-saas-founders',
    title: '50 Best Podcasts for SaaS Founders to Target in 2025',
    excerpt: 'A curated list of high-impact podcasts with engaged audiences, including listener demographics and how to get booked on each one.',
    content: '',
    author: 'Get On A Pod Team',
    publishedAt: '2025-01-02',
    category: 'Podcast Lists',
    tags: ['SaaS', 'Founders', 'Resources'],
    imageUrl: 'https://images.unsplash.com/photo-1�������������������������������������������������������������������������������������������������������������������������������������?w=800&h=500&fit=crop',
    readTime: '10 min read'
  },
  {
    id: '5',
    slug: 'repurposing-podcast-content',
    title: 'How to Repurpose Your Podcast Interview into 20+ Pieces of Content',
    excerpt: 'Maximize the value of every podcast appearance with our content repurposing framework that generates months of marketing materials.',
    content: '',
    author: 'Get On A Pod Team',
    publishedAt: '2024-12-30',
    category: 'Content Strategy',
    tags: ['Content Marketing', 'Repurposing', 'Social Media'],
    imageUrl: 'https://images.unsplash.com/photo-1611162616475-46b635cb6868?w=800&h=500&fit=crop',
    readTime: '7 min read'
  },
  {
    id: '6',
    slug: 'podcast-booking-pitch-templates',
    title: '5 Proven Podcast Pitch Templates That Get 60%+ Response Rates',
    excerpt: 'Stop getting ignored. These battle-tested email templates have booked our clients on hundreds of shows.',
    content: '',
    author: 'Get On A Pod Team',
    publishedAt: '2024-12-28',
    category: 'Outreach',
    tags: ['Email Templates', 'Pitching', 'Cold Outreach'],
    imageUrl: 'https://images.unsplash.com/photo-1596526131083-e8c633c948d2?w=800&h=500&fit=crop',
    readTime: '5 min read'
  }
];

export const categories = [
  'All',
  'Podcast Marketing',
  'Guest Tips',
  'Strategy',
  'Podcast Lists',
  'Content Strategy',
  'Outreach'
];
