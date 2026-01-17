import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { recordDashboard } from './recorder.js';
import fs from 'fs';
import path from 'path';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

app.post('/api/generate-video', async (req, res) => {
  const { dashboardId, slug } = req.body;

  console.log(`[${new Date().toISOString()}] Starting video generation for ${slug}`);

  try {
    // Update status to processing
    await supabase
      .from('prospect_dashboards')
      .update({ background_video_status: 'processing' })
      .eq('id', dashboardId);

    // Record the dashboard
    const outputDir = path.join(process.cwd(), 'recordings');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    console.log(`[${new Date().toISOString()}] Recording dashboard...`);
    const videoPath = await recordDashboard(slug, process.env.DASHBOARD_BASE_URL);
    console.log(`[${new Date().toISOString()}] Recording complete: ${videoPath}`);

    // Upload to Supabase Storage
    const videoBuffer = fs.readFileSync(videoPath);
    const fileName = `${dashboardId}-${Date.now()}.webm`;

    console.log(`[${new Date().toISOString()}] Uploading to Supabase Storage...`);
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('prospect-videos')
      .upload(fileName, videoBuffer, {
        contentType: 'video/webm',
        upsert: true
      });

    if (uploadError) throw uploadError;

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('prospect-videos')
      .getPublicUrl(fileName);

    console.log(`[${new Date().toISOString()}] Video uploaded: ${publicUrl}`);

    // Update database
    await supabase
      .from('prospect_dashboards')
      .update({
        background_video_url: publicUrl,
        background_video_generated_at: new Date().toISOString(),
        background_video_status: 'completed'
      })
      .eq('id', dashboardId);

    // Cleanup local file
    fs.unlinkSync(videoPath);
    console.log(`[${new Date().toISOString()}] Cleanup complete`);

    res.json({ success: true, videoUrl: publicUrl });

  } catch (error) {
    console.error('Error generating video:', error);

    await supabase
      .from('prospect_dashboards')
      .update({ background_video_status: 'failed' })
      .eq('id', dashboardId);

    res.status(500).json({ error: error.message });
  }
});

// HeyGen Video Generation Endpoint
app.post('/api/heygen/generate', async (req, res) => {
  const { dashboardId, backgroundVideoUrl, firstName } = req.body;

  console.log(`[${new Date().toISOString()}] Starting HeyGen video generation for ${firstName}`);

  try {
    // Build the personalized script with strategic pauses
    // Using periods and commas for natural pauses to sync with 42-second background video
    const script = `${firstName}, we have handpicked the best possible shows. At the top, we see the potential reach, the average rating, and how many podcasts are on the list that we can reach out to..... Each podcast card shows you detailed insights... the audience demographics, listener engagement, download numbers, and why we think it's a perfect match for your message.. You can approve or reject any show directly from the panel....... And here's our pricing, simple, transparent, and designed to get you maximum ROI. Please click the Book a call now Button to schedule a call.`;

    // Call HeyGen API
    const response = await fetch('https://api.heygen.com/v2/video/generate', {
      method: 'POST',
      headers: {
        'X-Api-Key': process.env.HEYGEN_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: `Prospect Video - ${firstName}`,
        caption: false,
        dimension: {
          width: 1280,
          height: 720,
        },
        video_inputs: [
          {
            character: {
              type: 'avatar',
              avatar_id: '821405cb2b04486593fd37616fee92f9',
              avatar_style: 'circle',
              scale: 0.35,
              offset: {
                x: -0.35,
                y: 0.25,
              },
            },
            voice: {
              type: 'text',
              input_text: script,
              voice_id: 'ba661971758a496c9ae1d807afb4aa87',
              speed: 0.95,
            },
            background: {
              type: 'video',
              url: backgroundVideoUrl,
              play_style: 'once',
              fit: 'cover',
            },
          },
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || `Failed to generate video: ${response.statusText}`);
    }

    const data = await response.json();
    const video_id = data.data.video_id;

    console.log(`[${new Date().toISOString()}] HeyGen video initiated: ${video_id}`);

    // Update database with HeyGen video ID
    await supabase
      .from('prospect_dashboards')
      .update({
        heygen_video_id: video_id,
        heygen_video_status: 'pending',
        heygen_video_generated_at: new Date().toISOString(),
      })
      .eq('id', dashboardId);

    res.json({ video_id });

  } catch (error) {
    console.error('Error generating HeyGen video:', error);
    res.status(500).json({ error: error.message });
  }
});

// HeyGen Video Status Endpoint (with database update)
app.get('/api/heygen/status/:videoId/:dashboardId', async (req, res) => {
  const { videoId, dashboardId } = req.params;

  console.log(`[${new Date().toISOString()}] Checking HeyGen video status: ${videoId} for dashboard: ${dashboardId}`);

  try {
    const response = await fetch(`https://api.heygen.com/v1/video_status.get?video_id=${videoId}`, {
      headers: {
        accept: 'application/json',
        'x-api-key': process.env.HEYGEN_API_KEY,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get video status: ${response.statusText}`);
    }

    const data = await response.json();
    const videoStatus = data.data;

    // Update database with current status using service role key
    const updateData = {
      heygen_video_status: videoStatus.status,
    };

    // Add optional fields if they exist
    if (videoStatus.video_url) {
      updateData.heygen_video_url = videoStatus.video_url;
    }
    if (videoStatus.thumbnail_url) {
      updateData.heygen_video_thumbnail_url = videoStatus.thumbnail_url;
    }

    const { error: dbError } = await supabase
      .from('prospect_dashboards')
      .update(updateData)
      .eq('id', dashboardId);

    if (dbError) {
      console.error('Database update error:', dbError);
      // Don't fail the request, but log it
    } else {
      console.log(`[${new Date().toISOString()}] Database updated: status=${videoStatus.status}`);
    }

    res.json(videoStatus);

  } catch (error) {
    console.error('Error getting HeyGen video status:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🎬 Video generator service running on port ${PORT}`);
  console.log(`🌐 Dashboard base URL: ${process.env.DASHBOARD_BASE_URL}`);
});
