/**
 * Test script to simulate onboarding completion and trigger webhook
 * Run with: node test-onboarding-webhook.js
 */

const SUPABASE_URL = 'https://ysjwveqnwjysldpfqzov.supabase.co'
const SUPABASE_ANON_KEY = 'your-anon-key-here' // Replace with your anon key

const sampleData = {
  // Required fields
  name: 'Test User',
  email: `test+${Date.now()}@example.com`, // Unique email each time

  // Optional client details
  bio: 'I am a marketing expert with 10+ years of experience helping startups grow from zero to hero. I specialize in growth marketing, conversion optimization, and building scalable acquisition channels.',
  linkedin_url: 'https://linkedin.com/in/testuser',
  website: 'https://testuser.com',
  calendar_link: 'https://calendly.com/testuser',
  contact_person: 'Test User',
  status: 'active',
  notes: `=== ONBOARDING INFORMATION ===

Goals: Brand Awareness, Thought Leadership, Client Acquisition
Ideal Audience: Startup founders, marketing professionals
Social Followers: 5,000 across platforms
Previous Podcasts: Marketing School, Growth Hackers Radio
Specific Podcasts: Tim Ferriss Show, My First Million

=== DETAILED RESPONSES ===

Expertise: Marketing, Growth, PR, Strategic Communication

Compelling Story:
I grew my first startup from 0 to $1M ARR in 12 months using only organic marketing channels. Along the way, I discovered the power of content marketing and podcast guesting, which led to my biggest enterprise deals. Now I help other founders replicate this success.

What Makes Them Unique:
Unlike most marketers who focus on paid ads, I built my entire career on organic, relationship-driven growth. I've been featured on 50+ podcasts and have a proven framework for podcast-driven customer acquisition.

Topics Confident Speaking About: Marketing, Copywriting, Growth, Entrepreneurship

Passions:
Helping founders build sustainable, profitable businesses without burning cash on ads. I'm passionate about democratizing growth knowledge and making it accessible to bootstrapped companies.`,

  // Portal access options
  enable_portal_access: true,
  password: 'TestPass123!', // Generated password
  send_invitation_email: false, // Don't send email for test

  // Google Sheet options
  create_google_sheet: false, // Skip Google Sheet for test
}

async function testOnboardingWebhook() {
  console.log('🧪 Testing Onboarding Webhook...\n')
  console.log('Sample data:')
  console.log(JSON.stringify(sampleData, null, 2))
  console.log('\n---\n')

  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/create-client-account`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(sampleData),
    })

    console.log(`Response status: ${response.status} ${response.statusText}`)

    const result = await response.json()

    if (response.ok) {
      console.log('\n✅ Success! Client created:\n')
      console.log(JSON.stringify(result, null, 2))
      console.log('\n---\n')
      console.log('Check your webhook endpoint to see the payload!')
      console.log('\nClient Portal URL:', result.client.portal_url)
      console.log('Dashboard URL:', result.client.dashboard_url)
      console.log('Email:', result.client.email)
      console.log('Password:', result.client.password)
    } else {
      console.error('\n❌ Error:', result.error)
    }
  } catch (error) {
    console.error('\n❌ Request failed:', error.message)
  }
}

// Run the test
testOnboardingWebhook()
