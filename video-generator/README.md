# Video Generator Service

Playwright-based service for generating background videos of prospect dashboards for HeyGen AI avatar integration.

## Railway Deployment

### 1. Push to Git

```bash
git add .
git commit -m "Add video generator service with Railway deployment config"
git push
```

### 2. Deploy to Railway

1. Go to [Railway](https://railway.app)
2. Click "New Project" → "Deploy from GitHub repo"
3. Select your repository
4. Railway will auto-detect the Dockerfile in `/video-generator`

**OR** use Railway CLI:

```bash
cd video-generator
railway init
railway up
```

### 3. Configure Environment Variables

In Railway dashboard, add these environment variables:

```env
SUPABASE_URL=https://ysjwveqnwjysldpfqzov.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
DASHBOARD_BASE_URL=https://getonapod.com
PORT=3001
```

### 4. Get Railway URL

After deployment, Railway will provide a URL like:
`https://your-service.railway.app`

### 5. Update Frontend Environment Variable

In your main project, update the Railway/production environment variable:

```env
VITE_VIDEO_SERVICE_URL=https://your-service.railway.app
```

## Local Development

```bash
npm install
npm start
```

Service runs on `http://localhost:3001`

## API Endpoints

### POST `/api/generate-video`

Generates a background video for a prospect dashboard.

**Request Body:**
```json
{
  "dashboardId": "uuid",
  "slug": "prospect-slug"
}
```

**Response:**
```json
{
  "success": true,
  "videoUrl": "https://supabase-storage-url/video.webm"
}
```

## Architecture

- **Playwright**: Headless Chromium browser for dashboard recording
- **Express**: REST API server
- **Supabase Storage**: Video file hosting
- **Docker**: Containerized deployment with all browser dependencies

## Video Recording Flow

1. Load prospect dashboard with `?tour=0` to skip welcome modal
2. Wait for page to fully load (6s)
3. Stay at hero section (4s)
4. Scroll to podcast grid (3s)
5. Click first podcast to open side panel
6. Scroll through panel slowly (12s)
7. Show approve/reject buttons at bottom (3s)
8. Close panel
9. Scroll to pricing section with buy buttons (3s)
10. Stay at pricing (5s)

**Total duration:** ~38 seconds

## Troubleshooting

### Docker Build Issues

If Playwright fails in Docker, ensure you're using the official Playwright image:
```dockerfile
FROM mcr.microsoft.com/playwright:v1.57.0-jammy
```

### Railway Deployment Issues

- Ensure PORT environment variable is set
- Check Railway logs for browser launch errors
- Verify all Supabase credentials are correct

### Video Not Generating

- Check that the dashboard URL is accessible
- Verify the slug exists in the database
- Check Railway logs for Playwright errors
