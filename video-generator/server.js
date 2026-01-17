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

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🎬 Video generator service running on port ${PORT}`);
  console.log(`🌐 Dashboard base URL: ${process.env.DASHBOARD_BASE_URL}`);
});
