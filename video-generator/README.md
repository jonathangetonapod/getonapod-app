# Video Generator Service

Full-stack video generation service that creates personalized AI avatar videos for prospect dashboards using Playwright screen recording and HeyGen AI avatar integration.

## Overview

This service provides a complete pipeline for generating personalized video presentations:

1. **Background Video Generation**: Records prospect dashboard walkthroughs using Playwright
2. **HeyGen AI Avatar Integration**: Overlays AI avatar with personalized voiceover using HeyGen V2 API
3. **Database Management**: Tracks video generation status and URLs in Supabase
4. **Video Delivery**: Provides download capability for final MP4 videos

## Architecture

```
Frontend (React/TypeScript)
    ↓ API calls
Backend Service (Express.js on Railway)
    ↓ records dashboard
Playwright (Headless Chromium)
    ↓ generates WebM
Supabase Storage
    ↓ provides background URL
HeyGen V2 API
    ↓ generates avatar video
Frontend downloads MP4
```

### Key Components

- **Backend Service**: Express.js server deployed on Railway with Supabase service role access
- **Playwright**: Headless browser for dashboard screen recording
- **HeyGen V2 API**: AI avatar video generation with custom backgrounds and voiceovers
- **Supabase**: Database for tracking status + Storage for background videos
- **Frontend**: React admin interface for triggering generation and downloading videos

### Security Architecture

- ✅ HeyGen API key stored securely in Railway backend environment
- ✅ All HeyGen API calls proxied through backend (never exposed to frontend)
- ✅ Database updates use Supabase service role key (bypasses RLS policies)
- ✅ Frontend uses anon key only for read operations

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
# Supabase Configuration
SUPABASE_URL=https://ysjwveqnwjysldpfqzov.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Dashboard URL for recording
DASHBOARD_BASE_URL=https://getonapod.com

# HeyGen API Integration
HEYGEN_API_KEY=your-heygen-api-key

# Server Configuration
PORT=3001
```

**Important**:
- Use Supabase **service role key** (not anon key) for database write access
- HeyGen API key must be kept secure on backend only (never expose to frontend)

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

Generates a background video recording of a prospect dashboard using Playwright.

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

**Process:**
1. Updates database status to `processing`
2. Records dashboard walkthrough with Playwright
3. Uploads WebM video to Supabase Storage
4. Updates database with video URL and status `completed`
5. Cleans up local recording file

**Database Updates:**
- `background_video_status`: 'processing' → 'completed' (or 'failed')
- `background_video_url`: Supabase Storage public URL
- `background_video_generated_at`: ISO timestamp

---

### POST `/api/heygen/generate`

Generates an AI avatar video with personalized voiceover using HeyGen V2 API.

**Request Body:**
```json
{
  "dashboardId": "uuid",
  "backgroundVideoUrl": "https://...",
  "firstName": "John"
}
```

**Response:**
```json
{
  "video_id": "heygen-video-id"
}
```

**Configuration:**
- **Avatar ID**: `821405cb2b04486593fd37616fee92f9` (custom Jonathan Garces avatar)
- **Avatar Style**: `circle` (transparent background, Loom-style)
- **Avatar Scale**: `0.35` (small corner overlay)
- **Avatar Position**: Lower left corner (`x: -0.35, y: 0.25`)
- **Voice ID**: `ba661971758a496c9ae1d807afb4aa87`
- **Voice Speed**: `0.95` (slightly slower for 42-second background sync)
- **Dimensions**: 1280x720 (HD)

**Script Template:**
The script is personalized with the prospect's first name and includes strategic pauses (using `...` and `....`) to sync with visual sections:
- Hero section: total reach, ratings, show count
- Podcast cards: demographics, engagement, downloads, reasoning
- Accept/reject panel: user control explanation
- Pricing section: ROI and CTA

**Process:**
1. Builds personalized script with prospect's first name
2. Calls HeyGen V2 API with avatar, voice, and background configuration
3. Receives `video_id` for status polling
4. Updates database with video ID and status `pending`

**Database Updates:**
- `heygen_video_id`: HeyGen video ID for polling
- `heygen_video_status`: 'pending'
- `heygen_video_generated_at`: ISO timestamp

---

### GET `/api/heygen/status/:videoId/:dashboardId`

Checks HeyGen video generation status and updates database with current state.

**URL Parameters:**
- `videoId`: HeyGen video ID
- `dashboardId`: Prospect dashboard UUID

**Response:**
```json
{
  "status": "completed",
  "video_url": "https://heygen-cdn.com/video.mp4",
  "thumbnail_url": "https://heygen-cdn.com/thumbnail.jpg",
  "duration": 42
}
```

**Possible Status Values:**
- `pending`: Video queued
- `waiting`: Waiting for processing
- `processing`: Video being generated
- `completed`: Video ready with URL
- `failed`: Generation failed with error details

**Process:**
1. Calls HeyGen API to get current video status
2. Updates database with service role key (bypasses RLS)
3. Returns status data to frontend

**Database Updates:**
- `heygen_video_status`: Current status from HeyGen
- `heygen_video_url`: Final MP4 URL (when completed)
- `heygen_video_thumbnail_url`: Thumbnail URL (when completed)

**Frontend Polling:**
- Frontend polls this endpoint every 5 seconds
- Max 120 attempts (10 minutes timeout)
- Backend ensures database stays in sync with HeyGen status

---

### GET `/health`

Health check endpoint for monitoring.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2026-01-17T19:44:54.206Z"
}
```

## Complete Video Generation Flow

### Step 1: Background Video Recording (~42 seconds)

Playwright records a walkthrough of the prospect dashboard:

1. Load prospect dashboard with `?tour=0` (skip welcome modal)
2. Wait for page to fully load (6s)
3. Stay at hero section showing total reach, ratings, show count (4s)
4. Scroll down to podcast grid (3s)
5. Click first podcast card to open side panel
6. Scroll through panel slowly showing demographics, engagement (12s)
7. Show approve/reject buttons at bottom (3s)
8. Close panel
9. Scroll to pricing section with buy buttons (3s)
10. Stay at pricing showing ROI and CTA (5s)

**Total duration:** ~42 seconds (WebM format)

### Step 2: HeyGen AI Avatar Video Generation

Once background video is uploaded to Supabase Storage:

1. **Frontend triggers**: Calls `/api/heygen/generate` with dashboard ID, background URL, and prospect name
2. **Backend processes**:
   - Builds personalized script with prospect's first name
   - Configures avatar (circle style, lower left corner, transparent background)
   - Configures voice (speed 0.95 to sync with 42-second background)
   - Calls HeyGen V2 API with all settings
   - Updates database with video ID and status 'pending'
3. **HeyGen processes**: Generates avatar video (typically 2-5 minutes)
4. **Frontend polls**: Checks `/api/heygen/status/:videoId/:dashboardId` every 5 seconds
5. **Backend updates**: On each poll, updates database with latest status from HeyGen
6. **Completion**: When status is 'completed', frontend shows download button

### Step 3: Video Download

Once HeyGen video is completed:

1. **Download button appears** in admin UI (only for completed videos)
2. **User clicks download**: Triggers fetch of video from HeyGen CDN
3. **Browser downloads**: MP4 file saved as `{prospect-name}-heygen-video.mp4`
4. **Ready for upload**: Video can be uploaded to Loom or other platforms

## Frontend Integration

### Admin Dashboard Features

Located in `src/pages/admin/ProspectDashboards.tsx`:

1. **Generate Background Video** button
   - Triggers Playwright recording
   - Shows "Generating Background Video..." spinner
   - Updates when background video completes

2. **Generate HeyGen Video** button
   - Appears after background video is ready
   - Triggers AI avatar video generation
   - Shows "Generating AI Video..." spinner with status

3. **Refresh Video Status** button (failsafe)
   - Manually checks video status from HeyGen
   - Updates database with latest status
   - Useful if polling was interrupted

4. **Download Video (MP4)** button
   - Appears when video status is 'completed'
   - Downloads final MP4 file to local machine
   - Filename format: `{prospect-name}-heygen-video.mp4`

### Database Schema

The `prospect_dashboards` table includes these video-related columns:

```sql
-- Background video (Playwright recording)
background_video_url: text
background_video_status: text ('processing' | 'completed' | 'failed')
background_video_generated_at: timestamp

-- HeyGen avatar video
heygen_video_id: text
heygen_video_url: text
heygen_video_status: text ('pending' | 'waiting' | 'processing' | 'completed' | 'failed')
heygen_video_thumbnail_url: text
heygen_video_generated_at: timestamp
```

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
- Confirm HEYGEN_API_KEY is set correctly

### Background Video Not Generating

- Check that the dashboard URL is accessible
- Verify the slug exists in the database
- Check Railway logs for Playwright errors
- Ensure Supabase Storage bucket `prospect-videos` exists and has public access

### HeyGen Video Issues

#### 401 Unauthorized from HeyGen API
- **Cause**: Invalid or missing HEYGEN_API_KEY
- **Solution**: Verify API key in Railway environment variables
- **Security**: Never expose HeyGen API key to frontend

#### Avatar Not Found Error
- **Cause**: Invalid avatar_id
- **Solution**: Use valid avatar ID (current: `821405cb2b04486593fd37616fee92f9`)
- **Check**: Verify avatar exists in your HeyGen account

#### Video Status Stuck at "Processing"
- **Cause**: Database not updating (RLS policy blocking writes)
- **Solution**: Ensure backend uses Supabase service role key (not anon key)
- **Verification**: Check Railway logs for database update errors
- **Failsafe**: Use "Refresh Video Status" button in admin UI

#### Voice Not Syncing with Background Video
- **Cause**: Script too short/long or voice speed incorrect
- **Solution**:
  - Adjust voice speed (current: 0.95)
  - Expand/contract script content
  - Use `...` for short pauses, `....` for longer pauses
  - Test timing: 42-second background = ~180 words at speed 0.95

#### SSML Tags Being Read Aloud
- **Cause**: HeyGen V2 API doesn't support SSML break tags
- **Solution**: Use ellipses (`...`) instead of `<break time="1s" />` for pauses

#### Download Button Not Appearing
- **Possible causes**:
  1. Video not completed (`heygen_video_status` not 'completed')
  2. Missing `heygen_video_url` in database
  3. Page needs refresh
- **Solutions**:
  1. Wait for video to complete (check status)
  2. Click "Refresh Video Status" button
  3. Check browser console for errors
  4. Verify database has `heygen_video_url` populated

### Checking Logs

**Railway logs** (backend):
```bash
railway logs --service video-generator-production
```

**Browser console** (frontend):
- Open DevTools (F12)
- Look for fetch errors or 500 responses
- Check Network tab for API call failures

### Database Status Check

Query Supabase to check video status:
```sql
SELECT
  prospect_name,
  background_video_status,
  heygen_video_status,
  heygen_video_url,
  heygen_video_id
FROM prospect_dashboards
WHERE id = 'your-dashboard-id';
```

## Customization

### Updating the Script

Edit the script in `server.js` line 100:

```javascript
const script = `${firstName}, your custom script here...`;
```

**Tips**:
- Use ellipses (`...`, `....`) for pauses
- ~180 words for 42-second video at speed 0.95
- Personalize with `${firstName}` variable
- Sync pauses with visual transitions

### Changing Avatar Settings

Edit avatar configuration in `server.js` line 118-127:

```javascript
character: {
  type: 'avatar',
  avatar_id: 'your-avatar-id',  // Get from HeyGen dashboard
  avatar_style: 'circle',        // 'circle' | 'normal' | 'closeUp' | 'full'
  scale: 0.35,                   // 0.1 to 1.0 (smaller = smaller avatar)
  offset: {
    x: -0.35,                    // -1 to 1 (negative = left)
    y: 0.25,                     // -1 to 1 (positive = down)
  },
}
```

### Changing Voice Settings

Edit voice configuration in `server.js` line 128-133:

```javascript
voice: {
  type: 'text',
  input_text: script,
  voice_id: 'your-voice-id',     // Get from HeyGen dashboard
  speed: 0.95,                   // 0.5 to 1.5 (lower = slower)
}
```

### Adjusting Video Dimensions

Edit dimensions in `server.js` line 112-115:

```javascript
dimension: {
  width: 1280,   // Standard: 1280x720 (HD), 1920x1080 (Full HD)
  height: 720,
}
```

## Performance & Costs

### HeyGen API Usage

- **Generation time**: 2-5 minutes per video
- **Video length**: ~42 seconds
- **Cost**: Based on HeyGen pricing plan (check your account)
- **Polling**: 5-second intervals for up to 10 minutes

### Playwright Recording

- **Recording time**: ~1 minute per video
- **Storage**: ~2-5 MB per WebM video in Supabase Storage
- **Compute**: Minimal (Railway handles scaling)

## Future Enhancements

Potential improvements:
- [ ] Batch video generation for multiple prospects
- [ ] Custom script templates per prospect segment
- [ ] A/B testing different avatar positions or scripts
- [ ] Webhook callback from HeyGen (instead of polling)
- [ ] Video analytics tracking (views, completions)
- [ ] Direct Loom API integration for automatic upload

## Support

For issues or questions:
1. Check Railway logs for backend errors
2. Check browser console for frontend errors
3. Verify all environment variables are set correctly
4. Test with health endpoint: `https://your-service.railway.app/health`
