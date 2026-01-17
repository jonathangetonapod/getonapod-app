const HEYGEN_API_BASE = 'https://api.heygen.com';
const HEYGEN_API_KEY = import.meta.env.VITE_HEYGEN_API_KEY;
const VIDEO_SERVICE_URL = import.meta.env.VITE_VIDEO_SERVICE_URL || 'http://localhost:3001';

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
 * Routes through the video-generator service which also updates the database
 */
export async function getVideoStatus(videoId: string, dashboardId: string): Promise<HeyGenVideoStatus> {
  const response = await fetch(`${VIDEO_SERVICE_URL}/api/heygen/status/${videoId}/${dashboardId}`, {
    headers: {
      accept: 'application/json',
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Failed to get video status: ${response.statusText}`);
  }

  const data = await response.json();
  return data;
}

/**
 * Generate HeyGen avatar video for a prospect dashboard using V2 API
 * This creates a video with AI avatar, custom background, and personalized script
 * Routes through the video-generator service to keep API keys secure
 */
export async function generateProspectVideo(
  dashboardId: string,
  backgroundVideoUrl: string,
  firstName: string
): Promise<string> {
  // Call video-generator service which will proxy to HeyGen API
  const response = await fetch(`${VIDEO_SERVICE_URL}/api/heygen/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      dashboardId,
      backgroundVideoUrl,
      firstName,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || `Failed to generate video: ${response.statusText}`);
  }

  const data = await response.json();
  return data.video_id;
}

/**
 * Poll video status until completion
 * Backend handles all database updates with service role key
 * Returns the final video URL when ready
 */
export async function pollVideoStatus(
  videoId: string,
  dashboardId: string,
  maxAttempts = 120,
  intervalMs = 5000
): Promise<string> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    console.log(`[Poll ${attempt + 1}/${maxAttempts}] Checking video ${videoId}...`);

    // Backend checks HeyGen AND updates database (has service role key)
    const status = await getVideoStatus(videoId, dashboardId);

    console.log(`[Poll ${attempt + 1}/${maxAttempts}] Status: ${status.status}`);

    if (status.status === 'completed' && status.video_url) {
      console.log(`Video completed! URL: ${status.video_url}`);
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

  throw new Error('Video generation timed out after 10 minutes');
}
