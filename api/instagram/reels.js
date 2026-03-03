const RAPIDAPI_HOST = 'instagram120.p.rapidapi.com';
const RAPIDAPI_URL = `https://${RAPIDAPI_HOST}/api/instagram/reels`;

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
    const response = await fetch(RAPIDAPI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-rapidapi-host': RAPIDAPI_HOST,
        'x-rapidapi-key': key,
      },
      body: JSON.stringify({
        username: body.username || '',
        maxId: body.maxId || '',
      }),
    });
    const data = await response.json().catch(() => ({}));
    res.status(response.status).json(data);
  } catch (err) {
    res.status(502).json({ error: 'Erro ao comunicar com a API.' });
  }
}
