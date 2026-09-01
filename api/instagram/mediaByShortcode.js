const RAPIDAPI_HOST = 'instagram-scraper-stable-api.p.rapidapi.com';

function toMediaUrl(shortcode) {
  const value = String(shortcode || '').trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  const isReel = /^\/?reel\//i.test(value);
  const code = value.replace(/^\/?(p|reel)\//i, '').replace(/\/$/, '');
  return isReel
    ? `https://www.instagram.com/reel/${code}/`
    : `https://www.instagram.com/p/${code}/`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const key = process.env.RAPIDAPI_KEY;
  if (!key) {
    return res.status(500).json({ error: 'RAPIDAPI_KEY não configurada no servidor.' });
  }

  try {
    const body = typeof req.body === 'object' && req.body !== null ? req.body : {};
    const mediaUrl = toMediaUrl(body.shortcode);
    const type = /\/reel\//i.test(mediaUrl) ? 'reel' : 'post';
    const url = new URL(`https://${RAPIDAPI_HOST}/get_media_data.php`);
    url.searchParams.set('reel_post_code_or_url', mediaUrl);
    url.searchParams.set('type', type);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'x-rapidapi-host': RAPIDAPI_HOST,
        'x-rapidapi-key': key,
      },
    });
    const data = await response.json().catch(() => ({}));
    res.status(response.status).json(data);
  } catch (err) {
    res.status(502).json({ error: 'Erro ao comunicar com a API.' });
  }
}
