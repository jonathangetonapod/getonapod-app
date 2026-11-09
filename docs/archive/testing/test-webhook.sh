#!/bin/bash

# Test script to simulate onboarding and trigger webhook
# Usage: ./test-webhook.sh

SUPABASE_URL="https://ysjwveqnwjysldpfqzov.supabase.co"
# Replace with your Supabase anon key (found in Settings > API)
SUPABASE_ANON_KEY="your-anon-key-here"

# Generate unique email for testing
TIMESTAMP=$(date +%s)
TEST_EMAIL="test+${TIMESTAMP}@example.com"

echo "🧪 Testing Onboarding Webhook..."
echo "Creating test client: $TEST_EMAIL"
echo ""

curl -X POST "${SUPABASE_URL}/functions/v1/create-client-account" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \
  -d '{
    "name": "Test User",
    "email": "'"${TEST_EMAIL}"'",
    "bio": "I am a marketing expert with 10+ years of experience helping startups grow. I specialize in growth marketing, conversion optimization, and building scalable acquisition channels.",
    "linkedin_url": "https://linkedin.com/in/testuser",
    "website": "https://testuser.com",
    "calendar_link": "https://calendly.com/testuser",
    "contact_person": "Test User",
    "status": "active",
    "notes": "=== TEST ONBOARDING DATA ===\n\nGoals: Brand Awareness, Thought Leadership\nIdeal Audience: Startup founders, marketers\nSocial Followers: 5,000 across platforms\nPrevious Podcasts: Marketing School, Growth Hackers\n\nCompelling Story:\nI grew my first startup from 0 to $1M ARR in 12 months using only organic marketing. Now I help other founders replicate this success through podcast guesting and content marketing.",
    "enable_portal_access": true,
    "password": "TestPass123!",
    "send_invitation_email": false,
    "create_google_sheet": false
  }' | jq '.'

echo ""
echo "✅ Done! Check your webhook endpoint for the payload."
echo ""
