const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { google } = require('googleapis');

const TOKENS_PATH = path.join(__dirname, '..', 'tokens.json');

function loadTokens() {
  return fs.existsSync(TOKENS_PATH) ? JSON.parse(fs.readFileSync(TOKENS_PATH, 'utf8')) : {};
}
// FIX #15 — atomic write via temp-file swap; power-loss can't corrupt tokens
function saveTokens(t) {
  const tmp = TOKENS_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(t, null, 2));
  fs.renameSync(tmp, TOKENS_PATH);
}

// ─── YouTube ──────────────────────────────────────────────────────────────────
async function publishYouTube(videoPath, { title, caption }) {
  const tokens = loadTokens();
  if (!tokens.youtube) throw new Error('YouTube not authorised — open Setup to connect.');

  const oauth2 = new google.auth.OAuth2(
    process.env.YOUTUBE_CLIENT_ID,
    process.env.YOUTUBE_CLIENT_SECRET,
    process.env.YOUTUBE_REDIRECT_URI || 'http://localhost:3456/oauth/youtube'
  );
  oauth2.setCredentials(tokens.youtube);
  oauth2.on('tokens', t => { tokens.youtube = { ...tokens.youtube, ...t }; saveTokens(tokens); });

  const yt = google.youtube({ version: 'v3', auth: oauth2 });
  const res = await yt.videos.insert({
    part: ['snippet', 'status'],
    requestBody: {
      snippet: { title: title || 'Daily Motivation', description: caption || '', tags: ['motivation','mindset','inspiration'], categoryId: '22' },
      status: { privacyStatus: 'public' },
    },
    media: { body: fs.createReadStream(videoPath) },
  });
  return { platform: 'YouTube', url: `https://youtube.com/shorts/${res.data.id}` };
}

// ─── Instagram ────────────────────────────────────────────────────────────────
async function publishInstagram(videoPath, { caption }) {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  const accountId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
  if (!token) throw new Error('Instagram token not set.');

  const fileSize = fs.statSync(videoPath).size;

  const init = await axios.post(`https://graph.facebook.com/v19.0/${accountId}/video_reels`,
    { upload_phase: 'start', access_token: token });
  const { upload_url, video_id } = init.data;

  await axios.post(upload_url, fs.readFileSync(videoPath), {
    headers: { Authorization: `OAuth ${token}`, 'Content-Type': 'video/mp4', 'Content-Length': fileSize, offset: 0, file_size: fileSize },
  });

  await axios.post(`https://graph.facebook.com/v19.0/${accountId}/video_reels`,
    { video_id, upload_phase: 'finish', video_state: 'PUBLISHED', description: caption || '', access_token: token });

  return { platform: 'Instagram', url: 'https://instagram.com' };
}

// ─── TikTok ───────────────────────────────────────────────────────────────────
async function publishTikTok(videoPath, { caption }) {
  const token = process.env.TIKTOK_ACCESS_TOKEN;
  if (!token) throw new Error('TikTok token not set.');

  const fileSize = fs.statSync(videoPath).size;
  const init = await axios.post('https://open.tiktokapis.com/v2/post/publish/video/init/', {
    post_info: { title: (caption || 'Daily Motivation').slice(0, 150), privacy_level: 'PUBLIC_TO_EVERYONE', disable_duet: false, disable_comment: false, disable_stitch: false },
    source_info: { source: 'FILE_UPLOAD', video_size: fileSize, chunk_size: fileSize, total_chunk_count: 1 },
  }, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8' } });

  await axios.put(init.data.data.upload_url, fs.readFileSync(videoPath), {
    headers: { 'Content-Type': 'video/mp4', 'Content-Range': `bytes 0-${fileSize - 1}/${fileSize}`, 'Content-Length': fileSize },
  });

  return { platform: 'TikTok', publishId: init.data.data.publish_id };
}

// ─── LinkedIn ─────────────────────────────────────────────────────────────────
async function publishLinkedIn(videoPath, { title, caption }) {
  const token = process.env.LINKEDIN_ACCESS_TOKEN;
  const urn = process.env.LINKEDIN_PERSON_URN;
  if (!token || !urn) throw new Error('LinkedIn token or URN not set.');

  const reg = await axios.post('https://api.linkedin.com/v2/assets?action=registerUpload', {
    registerUploadRequest: {
      owner: urn,
      recipes: ['urn:li:digitalmediaRecipe:feedshare-video'],
      serviceRelationships: [{ identifier: 'urn:li:userGeneratedContent', relationshipType: 'OWNER' }],
      supportedUploadMechanism: ['SYNCHRONOUS_UPLOAD'],
    },
  }, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });

  const uploadUrl = reg.data.value.uploadMechanism['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'].uploadUrl;
  const asset = reg.data.value.asset;

  await axios.put(uploadUrl, fs.readFileSync(videoPath), {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' },
    maxBodyLength: Infinity,
  });

  await axios.post('https://api.linkedin.com/v2/ugcPosts', {
    author: urn,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: { text: `${title || ''}\n\n${caption || ''}`.trim() },
        shareMediaCategory: 'VIDEO',
        media: [{ status: 'READY', media: asset, title: { text: title || 'Daily Motivation' } }],
      },
    },
    visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
  }, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });

  return { platform: 'LinkedIn', url: 'https://linkedin.com' };
}

// ─── Publish all — failures don't block others ────────────────────────────────
async function publishAll(videoPath, meta) {
  const results = await Promise.allSettled([
    publishYouTube(videoPath, meta),
    publishInstagram(videoPath, meta),
    publishTikTok(videoPath, meta),
    publishLinkedIn(videoPath, meta),
  ]);
  return results.map((r, i) => {
    const platform = ['YouTube','Instagram','TikTok','LinkedIn'][i];
    return r.status === 'fulfilled'
      ? { platform, ok: true, ...r.value }
      : { platform, ok: false, error: r.reason?.message };
  });
}

// ─── Image: Instagram ─────────────────────────────────────────────────────────
// FIX #5 — Instagram Graph API requires a publicly accessible image URL.
// We upload to Imgur anonymously (no auth, free) to get a public URL first.
async function uploadToImgur(imagePath) {
  const imageBase64 = fs.readFileSync(imagePath).toString('base64');
  const res = await axios.post('https://api.imgur.com/3/image', {
    image: imageBase64,
    type: 'base64',
  }, {
    headers: { Authorization: 'Client-ID 546c25a59c58ad7' }, // Imgur public client ID
  });
  if (!res.data?.data?.link) throw new Error('Imgur upload failed — no link returned');
  return res.data.data.link;
}

async function publishImageInstagram(imagePath, { caption }) {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  const accountId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
  if (!token) throw new Error('Instagram token not set.');

  const imageUrl = await uploadToImgur(imagePath);

  const createRes = await axios.post(
    `https://graph.facebook.com/v19.0/${accountId}/media`,
    { image_url: imageUrl, caption: caption || '', access_token: token }
  );
  const creationId = createRes.data.id;

  await axios.post(
    `https://graph.facebook.com/v19.0/${accountId}/media_publish`,
    { creation_id: creationId, access_token: token }
  );

  return { platform: 'Instagram', url: 'https://instagram.com' };
}

// ─── Image: LinkedIn ──────────────────────────────────────────────────────────
async function publishImageLinkedIn(imagePath, { caption }) {
  const token = process.env.LINKEDIN_ACCESS_TOKEN;
  const urn   = process.env.LINKEDIN_PERSON_URN;
  if (!token || !urn) throw new Error('LinkedIn token or URN not set.');

  // Register image upload
  const reg = await axios.post(
    'https://api.linkedin.com/v2/assets?action=registerUpload',
    {
      registerUploadRequest: {
        owner: urn,
        recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
        serviceRelationships: [{ identifier: 'urn:li:userGeneratedContent', relationshipType: 'OWNER' }],
        supportedUploadMechanism: ['SYNCHRONOUS_UPLOAD'],
      },
    },
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  );

  const uploadUrl = reg.data.value.uploadMechanism['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'].uploadUrl;
  const asset = reg.data.value.asset;

  await axios.put(uploadUrl, fs.readFileSync(imagePath), {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'image/jpeg' },
    maxBodyLength: Infinity,
  });

  await axios.post(
    'https://api.linkedin.com/v2/ugcPosts',
    {
      author: urn,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text: caption || '' },
          shareMediaCategory: 'IMAGE',
          media: [{ status: 'READY', media: asset }],
        },
      },
      visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
    },
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  );

  return { platform: 'LinkedIn', url: 'https://linkedin.com' };
}

// ─── Image: TikTok (photo post) ───────────────────────────────────────────────
// FIX #6 — use FILE_UPLOAD source with proper upload URL flow, not PULL_FROM_URL with data: URI
async function publishImageTikTok(imagePath, { caption }) {
  const token = process.env.TIKTOK_ACCESS_TOKEN;
  if (!token) throw new Error('TikTok token not set.');

  const fileSize = fs.statSync(imagePath).size;

  // Step 1: Init photo post and get upload URL
  const initRes = await axios.post(
    'https://open.tiktokapis.com/v2/post/publish/content/init/',
    {
      post_info: {
        title: (caption || '').slice(0, 150),
        privacy_level: 'PUBLIC_TO_EVERYONE',
        disable_comment: false,
      },
      source_info: {
        source: 'FILE_UPLOAD',
        post_mode: 'DIRECT_POST',
        media_type: 'PHOTO',
        photo_cover_index: 0,
        photo_images: [{ size: fileSize, mime_type: 'image/jpeg' }],
      },
    },
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8' } }
  );

  const uploadUrl = initRes.data?.data?.photo_upload_urls?.[0];
  if (!uploadUrl) throw new Error('TikTok did not return a photo upload URL');

  // Step 2: Upload image binary
  await axios.put(uploadUrl, fs.readFileSync(imagePath), {
    headers: { 'Content-Type': 'image/jpeg', 'Content-Length': fileSize },
    maxBodyLength: Infinity,
  });

  return { platform: 'TikTok', url: 'https://tiktok.com' };
}

// ─── Publish image to all platforms ──────────────────────────────────────────
async function publishAllImage(imagePath, meta) {
  const results = await Promise.allSettled([
    publishImageInstagram(imagePath, meta),
    publishImageTikTok(imagePath, meta),
    publishImageLinkedIn(imagePath, meta),
    // YouTube skipped for image posts — no native image post API
  ]);
  const platforms = ['Instagram', 'TikTok', 'LinkedIn'];
  return results.map((r, i) => {
    const platform = platforms[i];
    return r.status === 'fulfilled'
      ? { platform, ok: true, ...r.value }
      : { platform, ok: false, error: r.reason?.message };
  });
}

module.exports = { publishAll, publishAllImage };
