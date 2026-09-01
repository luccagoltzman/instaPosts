const RAPIDAPI_HOST = 'instagram-scraper-stable-api.p.rapidapi.com';
const RAPIDAPI_URL = `https://${RAPIDAPI_HOST}/get_ig_user_posts.php`;

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
    const params = new URLSearchParams();
    params.set('username_or_url', body.username || '');
    params.set('amount', String(body.amount || 12));
    params.set('pagination_token', body.maxId || body.pagination_token || '');

    const response = await fetch(RAPIDAPI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'x-rapidapi-host': RAPIDAPI_HOST,
        'x-rapidapi-key': key,
      },
      body: params.toString(),
    });
    const data = await response.json().catch(() => ({}));
    res.status(response.status).json(data);
  } catch (err) {
    res.status(502).json({ error: 'Erro ao comunicar com a API.' });
  }
}
