const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
app.use(cors());
app.use(express.json());

const AIM_BASE = 'https://active-ewebservice.biz/aeServices30/api';

app.all('/aim*', async (req, res) => {
  const aimPath = req.path.replace('/aim', '');
  const queryString = req.url.includes('?') ? '?' + req.url.split('?')[1] : '';
  const url = AIM_BASE + aimPath + queryString;

  const forwardHeaders = { 'Content-Type': 'application/json' };
  if (req.headers['apikey']) forwardHeaders['APIKey'] = req.headers['apikey'];
  if (req.headers['appid']) forwardHeaders['AppId'] = req.headers['appid'];
  if (req.headers['oauthtoken']) forwardHeaders['OAuthToken'] = req.headers['oauthtoken'];
  if (req.headers['token']) forwardHeaders['Token'] = req.headers['token'];

  console.log('Proxying:', req.method, url);
  console.log('Headers:', forwardHeaders);

  try {
    const response = await fetch(url, {
      method: req.method,
      headers: forwardHeaders,
      ...(req.method !== 'GET' && { body: JSON.stringify(req.body) })
    });

    const text = await response.text();
    console.log('AIM response:', text.substring(0, 200));

    try {
      res.status(response.status).json(JSON.parse(text));
    } catch {
      res.status(response.status).send(text);
    }
  } catch (err) {
    console.error('Proxy error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'AIM Proxy' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`AIM Proxy running on port ${PORT}`));
