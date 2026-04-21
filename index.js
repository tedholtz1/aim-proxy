const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
app.use(cors());
app.use(express.json());

const AIM_BASE = 'https://active-ewebservice.biz/aeServices30/api';

app.all('/aim/*', async (req, res) => {
  const aimPath = req.path.replace('/aim', '');
  const url = AIM_BASE + aimPath + (req.url.includes('?') ? '?' + req.url.split('?')[1] : '');
  
  try {
    const response = await fetch(url, {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        ...req.headers.apikey && { 'APIKey': req.headers.apikey },
        ...req.headers.appid && { 'AppId': req.headers.appid },
        ...req.headers.oauthtoken && { 'OAuthToken': req.headers.oauthtoken },
        ...req.headers.token && { 'Token': req.headers.token },
      },
      ...(req.method !== 'GET' && { body: JSON.stringify(req.body) })
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'AIM Proxy' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`AIM Proxy running on port ${PORT}`));
