import { createClient } from '@supabase/supabase-js'

// Supabase setup
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || ''
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const supabase = createClient(supabaseUrl, supabaseKey)

// Podscan API setup
const PODSCAN_API_URL = 'https://podscan.fm/api/v1'
const PODSCAN_TOKEN = 'tg7ZSteB27RqyNUqlIKtBK4gNAj8Hcm7z3oSzeYmd7421590'

// ALL possible categories
const ALL_CATEGORIES = [
  'ct_o9mjlawxowkdy3rp', 'ct_2v89gony7jnrqj3d', 'ct_ox4amd5d9pweyq2r', 'ct_akrev35bm4w4ypql',
  'ct_3krv4dnrrqn79l6o', 'ct_6olr4e5ek5b7yj2a', 'ct_z9majpn4r5o73bx8', 'ct_zqbe76njpnyjx432',
  'ct_rzemq35l4n9x27dy', 'ct_8kgrblw8aoneo36z', 'ct_6vqzjd529vn8xlep', 'ct_rzemq35lz4w9x27d',
  'ct_akrev35bv9w4ypql', 'ct_6zvjgq5arjw8drle', 'ct_vy2zbpn3lgnq3m7g', 'ct_6zvjgq5avj58drle',
  'ct_3pk7q259ebwvr4bx', 'ct_lxbp9dwoak5aeom7', 'ct_akrev35b8454ypql', 'ct_ox4amd5dkpneyq2r',
]

// ULTRA COMPREHENSIVE keyword list - 500+ search terms
const ULTRA_COMPREHENSIVE_QUERIES = [
  // Business - Core
  'business', 'entrepreneur', 'entrepreneurship', 'startup', 'founder', 'CEO', 'small business',
  'business owner', 'business growth', 'scaling', 'business strategy', 'business development',
  'solopreneur', 'side hustle', 'passive income', 'business coach', 'business consultant',

  // Marketing - Deep dive
  'marketing', 'digital marketing', 'social media marketing', 'content marketing', 'email marketing',
  'growth marketing', 'performance marketing', 'influencer marketing', 'affiliate marketing',
  'video marketing', 'podcast marketing', 'SEO', 'search engine optimization', 'SEM', 'PPC',
  'Google ads', 'Facebook ads', 'Instagram marketing', 'TikTok marketing', 'Twitter marketing',
  'LinkedIn marketing', 'YouTube marketing', 'marketing strategy', 'marketing automation',
  'CRM', 'customer relationship', 'brand', 'branding', 'brand building', 'brand strategy',
  'rebranding', 'personal brand', 'employer brand', 'storytelling', 'copywriting',
  'conversion optimization', 'CRO', 'landing pages', 'funnel', 'sales funnel',

  // Sales
  'sales', 'selling', 'B2B sales', 'B2C sales', 'enterprise sales', 'inside sales',
  'outside sales', 'sales development', 'SDR', 'BDR', 'account executive', 'sales management',
  'sales leadership', 'sales training', 'sales strategy', 'sales process', 'cold calling',
  'prospecting', 'lead generation', 'closing', 'negotiation', 'objection handling',

  // Finance - Comprehensive
  'finance', 'investing', 'investment', 'investor', 'stocks', 'stock market', 'equities',
  'bonds', 'options', 'futures', 'derivatives', 'trading', 'day trading', 'swing trading',
  'position trading', 'algorithmic trading', 'quantitative', 'technical analysis',
  'fundamental analysis', 'value investing', 'growth investing', 'dividend investing',
  'index funds', 'ETF', 'mutual funds', 'portfolio', 'asset allocation', 'diversification',
  'real estate', 'real estate investing', 'rental property', 'house flipping', 'wholesaling',
  'BRRRR', 'commercial real estate', 'multifamily', 'apartment investing', 'syndication',
  'REIT', 'crowdfunding', 'Fundrise', 'cryptocurrency', 'crypto', 'bitcoin', 'ethereum',
  'altcoins', 'blockchain', 'DeFi', 'NFT', 'web3', 'personal finance', 'financial planning',
  'financial advisor', 'wealth management', 'retirement', 'retirement planning', '401k', 'IRA',
  'Roth IRA', 'financial independence', 'FIRE', 'early retirement', 'wealth building',
  'money', 'saving money', 'budgeting', 'debt', 'debt free', 'credit', 'credit score',
  'mortgage', 'student loans', 'financial literacy', 'accounting', 'bookkeeping', 'CFO',
  'controller', 'CPA', 'tax', 'taxes', 'tax planning', 'tax strategy',

  // Technology - Extensive
  'technology', 'tech', 'software', 'software development', 'software engineering',
  'programming', 'coding', 'developer', 'web development', 'frontend', 'backend',
  'full stack', 'mobile development', 'app development', 'iOS development', 'Android',
  'React', 'React Native', 'JavaScript', 'Python', 'Java', 'C++', 'Ruby', 'PHP',
  'DevOps', 'cloud computing', 'AWS', 'Azure', 'Google Cloud', 'GCP', 'serverless',
  'microservices', 'containers', 'Docker', 'Kubernetes', 'CI/CD', 'infrastructure',
  'artificial intelligence', 'AI', 'machine learning', 'deep learning', 'neural networks',
  'data science', 'data analytics', 'data engineering', 'big data', 'analytics',
  'business intelligence', 'BI', 'SQL', 'database', 'NoSQL', 'MongoDB', 'PostgreSQL',
  'cybersecurity', 'security', 'information security', 'infosec', 'AppSec', 'network security',
  'ethical hacking', 'penetration testing', 'pen testing', 'bug bounty', 'OSCP',
  'privacy', 'data privacy', 'GDPR', 'compliance', 'risk management',
  'SaaS', 'PaaS', 'IaaS', 'product', 'product management', 'product manager',
  'product development', 'UX', 'user experience', 'UI', 'user interface', 'design',
  'product design', 'agile', 'scrum', 'kanban', 'project management', 'PM',
  'CTO', 'VP engineering', 'engineering manager', 'tech lead', 'architect',
  'software architecture', 'system design', 'API', 'REST', 'GraphQL',

  // E-commerce - Complete
  'ecommerce', 'e-commerce', 'online store', 'online business', 'shopify', 'WooCommerce',
  'BigCommerce', 'Magento', 'amazon', 'amazon FBA', 'amazon seller', 'amazon business',
  'dropshipping', 'drop shipping', 'print on demand', 'POD', 'Etsy', 'Etsy seller',
  'eBay', 'eBay seller', 'Poshmark', 'Mercari', 'DTC', 'direct to consumer', 'D2C',
  'online retail', 'retail', 'consumer products', 'CPG', 'digital products',

  // Leadership - Deep
  'leadership', 'leader', 'management', 'manager', 'executive', 'executive leadership',
  'executive coaching', 'CEO', 'president', 'VP', 'C-suite', 'board', 'director',
  'team building', 'team management', 'people management', 'talent', 'culture',
  'organizational culture', 'company culture', 'employee engagement', 'retention',
  'servant leadership', 'authentic leadership', 'transformational leadership',
  'situational leadership', 'emotional intelligence', 'EQ', 'communication',
  'public speaking', 'presentation', 'influence', 'persuasion',

  // Personal Development - Massive
  'personal development', 'self improvement', 'self help', 'self-help', 'growth',
  'personal growth', 'self-growth', 'motivation', 'motivational', 'inspiration',
  'mindset', 'growth mindset', 'positive thinking', 'affirmations', 'manifestation',
  'law of attraction', 'habits', 'habit building', 'atomic habits', 'productivity',
  'time management', 'prioritization', 'organization', 'planning', 'goal setting',
  'goals', 'achievement', 'success', 'high achiever', 'performance', 'peak performance',
  'high performance', 'excellence', 'mastery', 'expertise', 'deliberate practice',
  'discipline', 'self-discipline', 'willpower', 'focus', 'concentration', 'flow state',
  'morning routine', 'evening routine', 'routines', 'rituals', 'life hacks', 'life coaching',
  'life coach', 'transformation', 'change', 'resilience', 'grit', 'perseverance',

  // Health & Wellness - Ultra detailed
  'health', 'wellness', 'wellbeing', 'nutrition', 'diet', 'healthy eating', 'meal prep',
  'weight loss', 'fat loss', 'weight management', 'obesity', 'keto', 'ketogenic',
  'low carb', 'paleo', 'vegan', 'vegetarian', 'plant based', 'whole food',
  'intermittent fasting', 'fasting', 'carnivore', 'Mediterranean diet', 'DASH diet',
  'anti-inflammatory', 'gut health', 'microbiome', 'probiotics', 'supplements',
  'vitamins', 'minerals', 'protein', 'macros', 'calories', 'nutritionist', 'dietitian',
  'fitness', 'exercise', 'workout', 'training', 'strength training', 'resistance training',
  'weight lifting', 'bodybuilding', 'muscle building', 'hypertrophy', 'powerlifting',
  'Olympic lifting', 'crossfit', 'functional fitness', 'HIIT', 'cardio', 'running',
  'marathon', 'half marathon', '5K', '10K', 'ultramarathon', 'trail running',
  'cycling', 'triathlon', 'swimming', 'yoga', 'pilates', 'barre', 'dance fitness',
  'calisthenics', 'bodyweight', 'mobility', 'flexibility', 'stretching', 'recovery',
  'physical therapy', 'sports medicine', 'athletic performance', 'sports performance',
  'mental health', 'mental wellness', 'psychology', 'therapy', 'counseling',
  'psychotherapy', 'CBT', 'mindfulness', 'meditation', 'breathing', 'breathwork',
  'anxiety', 'depression', 'stress', 'stress management', 'burnout', 'trauma',
  'PTSD', 'addiction', 'recovery', 'sobriety', 'twelve steps', 'AA',
  'sleep', 'sleep quality', 'insomnia', 'sleep hygiene', 'rest',
  'longevity', 'anti-aging', 'biohacking', 'bio-hacking', 'optimization',
  'functional medicine', 'integrative medicine', 'holistic health', 'alternative medicine',
  'naturopathic', 'chiropractic', 'acupuncture', 'homeopathy', 'Ayurveda',

  // Medical & Healthcare
  'medicine', 'medical', 'healthcare', 'health care', 'doctor', 'physician', 'MD', 'DO',
  'nurse', 'nursing', 'nurse practitioner', 'PA', 'physician assistant', 'pharmacist',
  'pharmacy', 'pediatrics', 'pediatrician', 'family medicine', 'internal medicine',
  'cardiology', 'neurology', 'oncology', 'cancer', 'radiology', 'surgery', 'anesthesia',
  'emergency medicine', 'urgent care', 'primary care', 'specialist', 'hospital',
  'clinic', 'telehealth', 'telemedicine', 'public health', 'epidemiology',

  // Relationships & Family
  'relationships', 'relationship', 'dating', 'online dating', 'love', 'romance',
  'marriage', 'married', 'wedding', 'engagement', 'couple', 'partnership',
  'communication skills', 'conflict resolution', 'relationship coach', 'intimacy',
  'sex', 'sexuality', 'dating coach', 'matchmaker', 'breakup', 'heartbreak',
  'divorce', 'separation', 'co-parenting', 'blended family', 'stepfamily',
  'parenting', 'parent', 'mom', 'dad', 'mother', 'father', 'motherhood', 'fatherhood',
  'baby', 'infant', 'toddler', 'preschool', 'kids', 'children', 'teens', 'teenagers',
  'adolescent', 'parenting advice', 'positive parenting', 'gentle parenting',
  'conscious parenting', 'attachment parenting', 'pregnancy', 'prenatal', 'postpartum',
  'breastfeeding', 'formula feeding', 'sleep training', 'potty training',
  'homeschool', 'homeschooling', 'unschooling', 'education', 'learning',
  'child development', 'family', 'family life', 'work-life balance', 'working mom',
  'working parent', 'stay at home', 'adoption', 'foster', 'foster care', 'infertility',
  'IVF', 'fertility', 'trying to conceive', 'TTC',

  // Career & Professional
  'career', 'career development', 'career growth', 'career change', 'career transition',
  'job search', 'job hunting', 'resume', 'CV', 'cover letter', 'interview',
  'job interview', 'interviewing', 'recruiting', 'recruitment', 'talent acquisition',
  'HR', 'human resources', 'hiring', 'onboarding', 'employee', 'workplace',
  'office', 'corporate', 'professional development', 'skills', 'upskilling',
  'reskilling', 'learning and development', 'L&D', 'training', 'certification',
  'networking', 'professional network', 'LinkedIn', 'personal branding', 'reputation',
  'thought leadership', 'executive presence', 'career coach', 'resume writer',
  'freelance', 'freelancing', 'freelancer', 'consultant', 'consulting',
  'independent contractor', 'gig economy', 'gig worker', '1099', 'self-employed',
  'contract', 'contractor', 'remote work', 'work from home', 'WFH', 'distributed team',
  'virtual', 'digital nomad', 'location independent', 'salary', 'compensation',
  'benefits', 'equity', 'stock options', 'promotion', 'raise',

  // Creative & Arts
  'creative', 'creativity', 'art', 'artist', 'painting', 'drawing', 'illustration',
  'sculpture', 'photography', 'photographer', 'videography', 'cinematography',
  'filmmaking', 'film', 'movies', 'cinema', 'screenwriting', 'script', 'directing',
  'acting', 'actor', 'performer', 'music', 'musician', 'singer', 'songwriter',
  'producer', 'music production', 'audio', 'sound design', 'recording', 'studio',
  'guitar', 'piano', 'drums', 'vocals', 'DJ', 'electronic music', 'EDM',
  'hip hop', 'rap', 'rock', 'country', 'jazz', 'classical', 'indie',
  'design', 'designer', 'graphic design', 'UX design', 'UI design', 'web design',
  'interior design', 'architecture', 'fashion', 'fashion design', 'style', 'styling',
  'beauty', 'makeup', 'cosmetics', 'skincare', 'hair', 'hairstyling',
  'writing', 'writer', 'author', 'book', 'novel', 'fiction', 'nonfiction',
  'memoir', 'biography', 'poetry', 'poet', 'blogging', 'blogger', 'journalism',
  'journalist', 'reporter', 'content creator', 'creator', 'influencer',

  // Content & Media
  'content creation', 'YouTube', 'YouTuber', 'video', 'vlog', 'vlogger',
  'streaming', 'streamer', 'Twitch', 'live streaming', 'podcast', 'podcasting',
  'podcaster', 'audio', 'radio', 'broadcasting', 'media', 'social media',
  'Instagram', 'TikTok', 'Facebook', 'Twitter', 'Snapchat', 'Pinterest',
  'creator economy', 'monetization', 'sponsorship', 'brand deals', 'AdSense',
  'Patreon', 'membership', 'community', 'audience building', 'engagement',

  // Science & Academia
  'science', 'scientist', 'research', 'researcher', 'academic', 'professor',
  'university', 'PhD', 'graduate school', 'postdoc', 'laboratory', 'experiment',
  'physics', 'quantum', 'chemistry', 'biology', 'microbiology', 'genetics',
  'neuroscience', 'brain', 'cognitive science', 'astronomy', 'astrophysics',
  'cosmology', 'space', 'NASA', 'SpaceX', 'geology', 'earth science', 'climate',
  'meteorology', 'weather', 'oceanography', 'marine biology', 'ecology',
  'environmental science', 'botany', 'zoology', 'paleontology', 'archaeology',
  'anthropology', 'sociology', 'economics', 'political science', 'philosophy',
  'mathematics', 'statistics', 'data', 'computational', 'engineering',

  // News & Politics
  'news', 'current events', 'politics', 'political', 'government', 'policy',
  'legislation', 'law', 'congress', 'senate', 'house', 'election', 'voting',
  'democracy', 'republican', 'democrat', 'conservative', 'liberal', 'progressive',
  'libertarian', 'independent', 'bipartisan', 'political commentary', 'pundit',
  'analysis', 'opinion', 'debate', 'international', 'foreign policy', 'diplomacy',
  'geopolitics', 'world affairs', 'global', 'journalism', 'investigative',

  // Sports & Athletics
  'sports', 'athlete', 'athletic', 'football', 'NFL', 'college football',
  'basketball', 'NBA', 'college basketball', 'baseball', 'MLB', 'soccer',
  'futbol', 'MLS', 'Premier League', 'hockey', 'NHL', 'golf', 'PGA', 'tennis',
  'UFC', 'MMA', 'mixed martial arts', 'boxing', 'wrestling', 'Olympics',
  'track and field', 'volleyball', 'softball', 'lacrosse', 'cricket',
  'sports business', 'sports management', 'coaching', 'coach', 'sports psychology',
  'sports science', 'fantasy', 'fantasy football', 'fantasy sports', 'betting',
  'sports betting', 'gambling', 'odds', 'DFS', 'daily fantasy',

  // Entertainment & Pop Culture
  'entertainment', 'pop culture', 'celebrity', 'celebrities', 'Hollywood',
  'movies', 'film review', 'TV', 'television', 'TV shows', 'series', 'streaming',
  'Netflix', 'Hulu', 'Disney+', 'HBO', 'Amazon Prime', 'anime', 'manga',
  'comics', 'comic books', 'Marvel', 'DC', 'Star Wars', 'Star Trek',
  'science fiction', 'sci-fi', 'fantasy', 'horror', 'thriller', 'mystery',
  'gaming', 'video games', 'gamer', 'esports', 'competitive gaming',
  'PlayStation', 'Xbox', 'Nintendo', 'PC gaming', 'game development',
  'game design', 'Minecraft', 'Fortnite', 'Call of Duty', 'League of Legends',

  // Food & Beverage
  'food', 'cooking', 'chef', 'culinary', 'recipes', 'baking', 'pastry',
  'restaurant', 'hospitality', 'food business', 'food truck', 'catering',
  'wine', 'sommelier', 'vineyard', 'winery', 'beer', 'craft beer', 'brewing',
  'brewery', 'cocktail', 'mixology', 'bartender', 'coffee', 'barista',
  'cafe', 'tea', 'foodie', 'dining', 'cuisine', 'BBQ', 'grilling', 'smoking',

  // Travel & Lifestyle
  'travel', 'traveling', 'traveler', 'wanderlust', 'adventure', 'backpacking',
  'backpacker', 'solo travel', 'budget travel', 'luxury travel', 'tourism',
  'destinations', 'Europe', 'Asia', 'Africa', 'South America', 'digital nomad',
  'expat', 'expatriate', 'living abroad', 'travel hacking', 'points', 'miles',
  'credit cards', 'rewards', 'van life', 'RV', 'camping', 'hiking', 'outdoors',
  'national parks', 'road trip', 'cruising', 'cruise', 'beach', 'tropical',

  // Hobbies & Interests
  'hobbies', 'hobby', 'DIY', 'do it yourself', 'maker', 'crafts', 'crafting',
  'knitting', 'crochet', 'sewing', 'quilting', 'embroidery', 'needlework',
  'woodworking', 'carpentry', 'furniture', 'home improvement', 'renovation',
  'remodeling', 'gardening', 'garden', 'plants', 'horticulture', 'permaculture',
  'homesteading', 'urban farming', 'chickens', 'beekeeping', 'sustainable living',
  'cars', 'automotive', 'car enthusiast', 'classic cars', 'racing', 'motorsports',
  'motorcycles', 'biking', 'cycling', 'mountain biking', 'bikes',
  'fishing', 'hunting', 'shooting', 'archery', 'survival', 'bushcraft',
  'prepping', 'preparedness', 'self-reliance', 'off-grid', 'homestead',

  // Sustainability & Environment
  'sustainability', 'sustainable', 'climate change', 'climate', 'global warming',
  'environment', 'environmental', 'ecology', 'conservation', 'preservation',
  'ESG', 'renewable energy', 'solar', 'solar power', 'wind energy', 'wind power',
  'hydroelectric', 'geothermal', 'clean energy', 'green energy', 'electric vehicles',
  'EV', 'Tesla', 'zero waste', 'waste reduction', 'recycling', 'composting',
  'circular economy', 'regenerative', 'carbon', 'carbon neutral', 'net zero',
  'emissions', 'pollution', 'air quality', 'water', 'ocean', 'marine',

  // Legal
  'law', 'legal', 'attorney', 'lawyer', 'litigation', 'trial', 'court',
  'judge', 'justice', 'paralegal', 'law school', 'bar exam', 'practice',
  'law firm', 'solo practice', 'family law', 'divorce lawyer', 'custody',
  'criminal law', 'criminal defense', 'prosecutor', 'public defender',
  'civil rights', 'constitutional law', 'business law', 'corporate law',
  'contract', 'contracts', 'intellectual property', 'IP', 'patent', 'trademark',
  'copyright', 'employment law', 'labor law', 'immigration', 'immigration law',
  'estate planning', 'wills', 'trusts', 'probate', 'elder law',
  'real estate law', 'property law', 'landlord', 'tenant', 'personal injury',
  'tort', 'malpractice', 'class action', 'arbitration', 'mediation',

  // Real Estate - Comprehensive
  'real estate agent', 'realtor', 'broker', 'real estate broker', 'listing',
  'buyer agent', 'seller agent', 'property', 'home buying', 'home selling',
  'first time home buyer', 'mortgage broker', 'lending', 'hard money',
  'fix and flip', 'flipping', 'rental', 'rental property', 'landlording',
  'property management', 'tenant', 'eviction', 'Airbnb', 'short term rental',
  'STR', 'vacation rental', 'VRBO', 'house hacking', 'live-in flip',

  // Operations & Supply Chain
  'operations', 'operations management', 'supply chain', 'supply chain management',
  'logistics', 'distribution', 'warehouse', 'warehousing', 'inventory',
  'inventory management', 'procurement', 'sourcing', 'vendor', 'supplier',
  'manufacturing', 'production', 'lean', 'lean manufacturing', 'six sigma',
  'quality', 'quality control', 'QA', 'continuous improvement', 'kaizen',
  'process improvement', 'efficiency', 'optimization',

  // Nonprofit & Social
  'nonprofit', 'non-profit', 'charity', 'charitable', 'philanthropy',
  'fundraising', 'donor', 'grant', 'foundation', 'social enterprise',
  'social impact', 'impact', 'mission driven', 'cause', 'volunteering',
  'volunteer', 'service', 'community service', 'activism', 'activist',
  'advocacy', 'social justice', 'justice', 'equality', 'equity', 'diversity',
  'inclusion', 'DEI', 'DEIB', 'belonging', 'civil rights', 'human rights',

  // Religion & Spirituality
  'Christianity', 'Christian', 'Jesus', 'Christ', 'faith', 'Bible', 'gospel',
  'scripture', 'prayer', 'worship', 'church', 'pastor', 'ministry', 'minister',
  'theology', 'apologetics', 'discipleship', 'evangelism', 'mission', 'missionary',
  'Catholic', 'Protestant', 'evangelical', 'Baptist', 'Methodist', 'Presbyterian',
  'Pentecostal', 'Lutheran', 'Orthodox', 'Islam', 'Muslim', 'Quran', 'Allah',
  'Judaism', 'Jewish', 'Torah', 'rabbi', 'synagogue', 'Buddhism', 'Buddhist',
  'Buddha', 'dharma', 'meditation practice', 'Hinduism', 'Hindu', 'yoga philosophy',
  'spirituality', 'spiritual', 'consciousness', 'awakening', 'enlightenment',
  'mysticism', 'metaphysical', 'new age', 'energy healing', 'chakra', 'reiki',

  // History & Culture
  'history', 'historical', 'historian', 'ancient history', 'medieval', 'Renaissance',
  'World War I', 'WWI', 'World War II', 'WWII', 'World War 2', 'Vietnam War',
  'Civil War', 'American history', 'European history', 'Asian history',
  'African history', 'Latin American history', 'military history', 'war',
  'battle', 'revolution', 'empire', 'civilization', 'culture', 'cultural',
  'heritage', 'tradition', 'mythology', 'folklore', 'legend',

  // True Crime & Mystery
  'true crime', 'crime', 'murder', 'homicide', 'serial killer', 'killer',
  'detective', 'investigation', 'investigative', 'cold case', 'unsolved',
  'missing person', 'disappearance', 'forensics', 'forensic', 'FBI', 'police',
  'law enforcement', 'criminal justice', 'criminology', 'mystery', 'mysteries',

  // Parenting Specialties
  'special needs', 'autism', 'ADHD', 'learning disability', 'dyslexia',
  'gifted', 'twins', 'multiples', 'single mom', 'single dad', 'single parent',
  'stepmom', 'stepdad', 'grandparent', 'grandparenting',

  // Business Types & Industries
  'franchise', 'franchising', 'franchisee', 'franchisor', 'agency',
  'marketing agency', 'creative agency', 'advertising agency', 'digital agency',
  'dental', 'dentist', 'dentistry', 'orthodontics', 'medical practice',
  'private practice', 'law firm', 'CPA firm', 'accounting firm',
  'retail store', 'brick and mortar', 'salon', 'hair salon', 'barber shop',
  'spa', 'med spa', 'wellness center', 'gym', 'fitness studio', 'yoga studio',
  'pilates studio', 'martial arts', 'dojo', 'dance studio', 'music school',
  'tutoring', 'education business', 'coaching business', 'consultancy',

  // Niche Tech Topics
  'no code', 'low code', 'automation', 'zapier', 'workflow', 'productivity tools',
  'notion', 'Airtable', 'spreadsheet', 'Excel', 'data visualization',
  'Tableau', 'Power BI', 'VR', 'virtual reality', 'AR', 'augmented reality',
  'metaverse', 'IoT', 'internet of things', 'robotics', 'drones', 'UAV',
  '3D printing', 'additive manufacturing', 'quantum computing', 'edge computing',

  // Advanced Health Topics
  'hormone', 'hormones', 'testosterone', 'estrogen', 'thyroid', 'adrenal',
  'cortisol', 'insulin', 'blood sugar', 'diabetes', 'prediabetes',
  'autoimmune', 'inflammation', 'chronic pain', 'fibromyalgia', 'chronic fatigue',
  'Lyme disease', 'mold', 'toxins', 'detox', 'cleanse', 'fasting protocol',
  'carnivore diet', 'ancestral health', 'primal', 'ketogenic lifestyle',

  // Mental Performance & Learning
  'memory', 'memory improvement', 'mnemonics', 'speed reading', 'reading',
  'learning', 'learning strategies', 'study skills', 'note taking', 'Zettelkasten',
  'second brain', 'knowledge management', 'cognitive enhancement', 'nootropics',
  'brain optimization', 'neuroplasticity', 'accelerated learning',

  // Extreme & Adventure Sports
  'extreme sports', 'action sports', 'skydiving', 'BASE jumping', 'wingsuit',
  'rock climbing', 'climbing', 'bouldering', 'mountaineering', 'alpinism',
  'skiing', 'snowboarding', 'skateboarding', 'surfing', 'kitesurfing',
  'windsurfing', 'scuba diving', 'freediving', 'spearfishing', 'sailing',

  // Economics & Macro
  'economics', 'economy', 'economist', 'macroeconomics', 'microeconomics',
  'monetary policy', 'fiscal policy', 'federal reserve', 'fed', 'central bank',
  'interest rates', 'inflation', 'deflation', 'recession', 'depression',
  'GDP', 'unemployment', 'economic policy', 'capitalism', 'socialism',
  'free market', 'Austrian economics', 'Keynesian', 'trade', 'tariff',

  // Additional Niches
  'aviation', 'pilot', 'flying', 'aircraft', 'planes', 'airline',
  'trucking', 'truck driver', 'CDL', 'logistics career', 'delivery',
  'antiques', 'collectibles', 'numismatics', 'coins', 'stamps',
  'watches', 'luxury', 'luxury goods', 'high end', 'premium',
  'wedding', 'wedding planning', 'event planning', 'events', 'conference',
  'public relations', 'PR', 'crisis management', 'reputation management',
  'customer service', 'customer experience', 'CX', 'customer success',
  'community management', 'moderation', 'forum', 'Discord',
  'newsletters', 'Substack', 'email newsletter', 'journalism newsletter',
]

interface PodscanPodcast {
  podcast_id: string
  podcast_name: string
  podcast_description?: string
  podcast_guid?: string
  podcast_image_url?: string
  podcast_url?: string
  podcast_itunes_id?: string
  podcast_spotify_id?: string
  rss_url?: string
  podcast_categories?: Array<{
    category_id: string
    category_name: string
  }>
  language?: string
  region?: string
  episode_count?: number
  last_posted_at?: string
  is_active?: boolean
  podcast_has_guests?: boolean
  podcast_has_sponsors?: boolean
  publisher_name?: string
  host_name?: string
  podcast_reach_score?: number
  reach?: {
    itunes?: {
      itunes_rating_average?: string
      itunes_rating_count?: string
      itunes_rating_count_bracket?: string
    }
    spotify?: {
      spotify_rating_average?: string
      spotify_rating_count?: string
      spotify_rating_count_bracket?: string
    }
    audience_size?: number
    reach_score?: number
    email?: string
    website?: string
    social_links?: Array<{
      platform: string
      url: string
    }>
  }
}

interface PodscanSearchResponse {
  podcasts: PodscanPodcast[]
  page: number
  per_page: number
  total_count: number
}

// 1 year window
function get1YearAgo(): string {
  const date = new Date()
  date.setFullYear(date.getFullYear() - 1)
  return date.toISOString().split('T')[0]
}

async function searchByCategories(page: number = 1): Promise<PodscanSearchResponse> {
  const params = new URLSearchParams({
    category_ids: ALL_CATEGORIES.join(','),
    language: 'en',
    min_audience_size: '100', // ULTRA low threshold
    min_last_episode_posted_at: get1YearAgo(),
    per_page: '50',
    order_by: 'audience_size',
    order_dir: 'desc',
    page: page.toString()
  })

  const response = await fetch(`${PODSCAN_API_URL}/podcasts/search?${params.toString()}`, {
    headers: {
      'Authorization': `Bearer ${PODSCAN_TOKEN}`,
      'Content-Type': 'application/json'
    }
  })

  if (!response.ok) {
    throw new Error(`Podscan API error: ${response.status}`)
  }

  return await response.json()
}

async function searchByKeyword(query: string, page: number = 1): Promise<PodscanSearchResponse> {
  const params = new URLSearchParams({
    q: query,
    language: 'en',
    min_audience_size: '100', // ULTRA low
    min_last_episode_posted_at: get1YearAgo(),
    per_page: '50',
    order_by: 'audience_size',
    order_dir: 'desc',
    page: page.toString()
  })

  const response = await fetch(`${PODSCAN_API_URL}/podcasts/search?${params.toString()}`, {
    headers: {
      'Authorization': `Bearer ${PODSCAN_TOKEN}`,
      'Content-Type': 'application/json'
    }
  })

  if (!response.ok) {
    throw new Error(`Podscan API error: ${response.status}`)
  }

  return await response.json()
}

function mapPodcastToDb(podcast: PodscanPodcast) {
  return {
    podscan_id: podcast.podcast_id,
    podcast_name: podcast.podcast_name,
    podcast_description: podcast.podcast_description || null,
    podcast_guid: podcast.podcast_guid || null,
    podcast_image_url: podcast.podcast_image_url || null,
    podcast_url: podcast.podcast_url || null,
    podcast_itunes_id: podcast.podcast_itunes_id || null,
    podcast_spotify_id: podcast.podcast_spotify_id || null,
    rss_url: podcast.rss_url || null,
    podcast_categories: podcast.podcast_categories || null,
    language: podcast.language || null,
    region: podcast.region || null,
    episode_count: podcast.episode_count || null,
    last_posted_at: podcast.last_posted_at || null,
    is_active: podcast.is_active ?? true,
    podcast_has_guests: podcast.podcast_has_guests || null,
    podcast_has_sponsors: podcast.podcast_has_sponsors || null,
    publisher_name: podcast.publisher_name || null,
    host_name: podcast.host_name || null,
    itunes_rating: podcast.reach?.itunes?.itunes_rating_average ? parseFloat(podcast.reach.itunes.itunes_rating_average) : null,
    itunes_rating_count: podcast.reach?.itunes?.itunes_rating_count ? parseInt(podcast.reach.itunes.itunes_rating_count) : null,
    itunes_rating_count_bracket: podcast.reach?.itunes?.itunes_rating_count_bracket || null,
    spotify_rating: podcast.reach?.spotify?.spotify_rating_average ? parseFloat(podcast.reach.spotify.spotify_rating_average) : null,
    spotify_rating_count: podcast.reach?.spotify?.spotify_rating_count ? parseInt(podcast.reach.spotify.spotify_rating_count) : null,
    spotify_rating_count_bracket: podcast.reach?.spotify?.spotify_rating_count_bracket || null,
    audience_size: podcast.reach?.audience_size || null,
    podcast_reach_score: podcast.podcast_reach_score || null,
    podscan_email: podcast.reach?.email || null,
    website: podcast.reach?.website || null,
    social_links: podcast.reach?.social_links || null,
    podscan_last_fetched_at: new Date().toISOString(),
    podscan_fetch_count: 1,
    cache_hit_count: 0
  }
}

async function insertBatch(podcasts: any[]) {
  if (podcasts.length === 0) return

  const { error } = await supabase
    .from('podcasts')
    .upsert(podcasts, {
      onConflict: 'podscan_id',
      ignoreDuplicates: false
    })

  if (error) throw error
}

async function ultraExpansion() {
  console.log('🚀 ULTRA MAXIMUM PODCAST EXPANSION')
  console.log(`📅 Time window: Last 365 days (since ${get1YearAgo()})`)
  console.log(`👥 Min audience: 100 (ultra low threshold)`)
  console.log(`🔍 Keyword searches: ${ULTRA_COMPREHENSIVE_QUERIES.length}`)
  console.log(`📂 Categories: ${ALL_CATEGORIES.length}`)
  console.log(`📄 Pages per keyword: 5`)
  console.log(`📄 Category pages: 200+\n`)

  const allPodcasts = new Map<string, any>()
  let apiCalls = 0

  try {
    // PHASE 1: Deep category scraping
    console.log(`${'='.repeat(70)}`)
    console.log(`PHASE 1: CATEGORY SCRAPING`)
    console.log(`${'='.repeat(70)}`)

    for (let page = 1; page <= 200; page++) {
      try {
        const response = await searchByCategories(page)
        apiCalls++

        if (response.podcasts.length === 0) break

        const mapped = response.podcasts
          .filter(p => p.podcast_id && p.podcast_name)
          .map(mapPodcastToDb)

        let newCount = 0
        mapped.forEach(p => {
          if (!allPodcasts.has(p.podscan_id)) {
            allPodcasts.set(p.podscan_id, p)
            newCount++
          }
        })

        if (page % 10 === 0) {
          console.log(`  Page ${page}: Total unique = ${allPodcasts.size}`)
        }

        if (response.podcasts.length < 50) break

        // Auto-save every 50 pages
        if (page % 50 === 0) {
          console.log(`\n💾 AUTO-SAVE at page ${page}...`)
          const arr = Array.from(allPodcasts.values())
          for (let i = 0; i < arr.length; i += 100) {
            await insertBatch(arr.slice(i, i + 100))
          }
          console.log(`✅ Saved ${arr.length} podcasts\n`)
        }

        await new Promise(r => setTimeout(r, 1200))

      } catch (error) {
        console.error(`❌ Page ${page} failed:`, error)
        break
      }
    }

    console.log(`\n✅ Phase 1: ${allPodcasts.size} unique podcasts`)

    // PHASE 2: Keyword blitz
    console.log(`\n${'='.repeat(70)}`)
    console.log(`PHASE 2: KEYWORD BLITZ (${ULTRA_COMPREHENSIVE_QUERIES.length} queries)`)
    console.log(`${'='.repeat(70)}\n`)

    let queryNum = 0

    for (const query of ULTRA_COMPREHENSIVE_QUERIES) {
      queryNum++

      for (let page = 1; page <= 5; page++) {
        try {
          const response = await searchByKeyword(query, page)
          apiCalls++

          if (response.podcasts.length === 0) break

          const mapped = response.podcasts
            .filter(p => p.podcast_id && p.podcast_name)
            .map(mapPodcastToDb)

          let newCount = 0
          mapped.forEach(p => {
            if (!allPodcasts.has(p.podscan_id)) {
              allPodcasts.set(p.podscan_id, p)
              newCount++
            }
          })

          if (response.podcasts.length < 50) break

          await new Promise(r => setTimeout(r, 1200))

        } catch (error) {
          break
        }
      }

      if (queryNum % 50 === 0) {
        console.log(`  [${queryNum}/${ULTRA_COMPREHENSIVE_QUERIES.length}] Total: ${allPodcasts.size}`)
      }

      // Auto-save every 100 queries
      if (queryNum % 100 === 0) {
        console.log(`\n💾 AUTO-SAVE at query ${queryNum}...`)
        const arr = Array.from(allPodcasts.values())
        for (let i = 0; i < arr.length; i += 100) {
          await insertBatch(arr.slice(i, i + 100))
        }
        console.log(`✅ Saved ${arr.length} podcasts\n`)
      }
    }

    // FINAL SAVE
    console.log(`\n${'='.repeat(70)}`)
    console.log(`FINAL SAVE`)
    console.log(`${'='.repeat(70)}`)

    const final = Array.from(allPodcasts.values())
    console.log(`Inserting ${final.length} podcasts...`)

    for (let i = 0; i < final.length; i += 100) {
      await insertBatch(final.slice(i, i + 100))
      if ((i / 100 + 1) % 10 === 0) {
        console.log(`  Batch ${i / 100 + 1}/${Math.ceil(final.length / 100)}`)
      }
    }

    console.log(`\n${'='.repeat(70)}`)
    console.log(`✨ ULTRA EXPANSION COMPLETE`)
    console.log(`${'='.repeat(70)}`)
    console.log(`📊 Total podcasts: ${final.length}`)
    console.log(`🔢 API calls: ${apiCalls}`)
    console.log(`🔍 Queries searched: ${ULTRA_COMPREHENSIVE_QUERIES.length}`)

  } catch (error) {
    console.error('❌ Fatal:', error)
    throw error
  }
}

ultraExpansion()
  .then(() => {
    console.log('\n🎉 DONE!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n💥 FATAL:', error)
    process.exit(1)
  })
