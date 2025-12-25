#!/bin/bash

# Deploy Blog Edge Functions to Supabase
# Run this script to deploy both AI generation and indexing functions

set -e

echo "🚀 Deploying Blog Edge Functions to Supabase..."
echo ""

# Check if Supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "❌ Error: Supabase CLI not found"
    echo "Please install it with: npm install -g supabase"
    exit 1
fi

# Deploy generate-blog-content function
echo "📝 Deploying generate-blog-content..."
npx supabase functions deploy generate-blog-content

echo ""

# Deploy submit-to-indexing function
echo "📊 Deploying submit-to-indexing..."
npx supabase functions deploy submit-to-indexing

echo ""
echo "✅ All Edge Functions deployed successfully!"
echo ""
echo "📌 Next steps:"
echo "1. Set secrets with: npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-..."
echo "2. Set secrets with: npx supabase secrets set GOOGLE_INDEXING_TOKEN=ya29..."
echo "3. Set secrets with: npx supabase secrets set SUPABASE_SERVICE_ROLE_KEY=eyJ..."
echo ""
echo "To check function status: npx supabase functions list"
echo "To view logs: npx supabase functions logs generate-blog-content"
