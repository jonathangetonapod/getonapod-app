import { supabase } from '@/lib/supabase';

const HEYGEN_API_BASE = 'https://api.heygen.com';
const HEYGEN_API_KEY = import.meta.env.VITE_HEYGEN_API_KEY;

export interface HeyGenTemplateVariable {
  name: string;
  type: 'text' | 'image' | 'video' | 'audio' | 'avatar';
  properties: Record<string, any>;
}

export interface HeyGenGenerateRequest {
  title: string;
  caption?: boolean;
  variables: Record<string, HeyGenTemplateVariable>;
}

export interface HeyGenVideoStatus {
  id: string;
  status: 'pending' | 'waiting' | 'processing' | 'completed' | 'failed';
  video_url?: string | null;
  thumbnail_url?: string | null;
  gif_url?: string | null;
  duration?: number | null;
  created_at?: number;
  callback_id?: string | null;
  caption_url?: string | null;
  video_url_caption?: string | null;
  error?: {
    code: number;
    message: string;
    detail: string;
  } | null;
}

/**
 * Get list of all templates
 */
export async function listTemplates() {
  const response = await fetch(`${HEYGEN_API_BASE}/v2/templates`, {
    headers: {
      accept: 'application/json',
      'x-api-key': HEYGEN_API_KEY,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to list templates: ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Get template details including all variables
 */
export async function getTemplateDetails(templateId: string = HEYGEN_TEMPLATE_ID) {
  const response = await fetch(`${HEYGEN_API_BASE}/v3/template/${templateId}`, {
    headers: {
      accept: 'application/json',
      'x-api-key': HEYGEN_API_KEY,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to get template details: ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Generate a video from template with custom variables
 */
export async function generateVideoFromTemplate(
  request: HeyGenGenerateRequest,
  templateId: string = HEYGEN_TEMPLATE_ID
): Promise<{ video_id: string }> {
  const response = await fetch(
    `${HEYGEN_API_BASE}/v2/template/${templateId}/generate`,
    {
      method: 'POST',
      headers: {
        'X-Api-Key': HEYGEN_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || `Failed to generate video: ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Get video status and details
 */
export async function getVideoStatus(videoId: string): Promise<HeyGenVideoStatus> {
  const response = await fetch(`${HEYGEN_API_BASE}/v1/video_status.get?video_id=${videoId}`, {
    headers: {
      accept: 'application/json',
      'x-api-key': HEYGEN_API_KEY,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to get video status: ${response.statusText}`);
  }

  const data = await response.json();
  return data.data;
}

/**
 * Generate HeyGen avatar video for a prospect dashboard using V2 API
 * This creates a video with AI avatar, custom background, and personalized script
 */
export async function generateProspectVideo(
  dashboardId: string,
  backgroundVideoUrl: string,
  firstName: string
): Promise<string> {
  // Build the personalized script
  const script = `Hi ${firstName}, I wanted to show you something personalized just for you. Here's your custom dashboard where we've curated podcasts specifically for your industry and audience. Right here on the hero section, you can see all the shows we've selected that align with your goals. Each podcast card shows you detailed insights - the audience demographics, listener engagement, download numbers, and why we think it's a perfect match for your message. You can approve or reject any show directly from the panel. And here's our pricing - simple, transparent, and designed to get you maximum ROI. I'd love to discuss which podcasts resonated with you most. Ready to get started?`;

  // Create avatar video using V2 API
  const response = await fetch(`${HEYGEN_API_BASE}/v2/video/generate`, {
    method: 'POST',
    headers: {
      'X-Api-Key': HEYGEN_API_KEY,
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
            avatar_id: 'Tyler_sitting_20240711', // Default professional avatar
            avatar_style: 'normal',
          },
          voice: {
            type: 'text',
            input_text: script,
            voice_id: '1bd001e7e50f421d891986aad5158bc8', // Default professional voice
          },
          background: {
            type: 'video',
            url: backgroundVideoUrl,
            play_style: 'once', // Play the full 42-second video once
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

  // Update database with HeyGen video ID
  await supabase
    .from('prospect_dashboards')
    .update({
      heygen_video_id: video_id,
      heygen_video_status: 'pending',
      heygen_video_generated_at: new Date().toISOString(),
    })
    .eq('id', dashboardId);

  return video_id;
}

/**
 * Poll video status until completion
 * Returns the final video URL when ready
 */
export async function pollVideoStatus(
  videoId: string,
  dashboardId: string,
  maxAttempts = 60,
  intervalMs = 5000
): Promise<string> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const status = await getVideoStatus(videoId);

    // Update database with current status
    await supabase
      .from('prospect_dashboards')
      .update({
        heygen_video_status: status.status,
        ...(status.video_url && { heygen_video_url: status.video_url }),
        ...(status.thumbnail_url && { heygen_video_thumbnail_url: status.thumbnail_url }),
      })
      .eq('id', dashboardId);

    if (status.status === 'completed' && status.video_url) {
      return status.video_url;
    }

    if (status.status === 'failed') {
      const errorMessage = status.error
        ? `${status.error.message}: ${status.error.detail}`
        : 'Video generation failed';
      throw new Error(errorMessage);
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error('Video generation timed out');
}
