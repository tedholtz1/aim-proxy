const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const AIM_STATIC_BASE = 'https://active-ewebservice.biz/aeServices30/api';

// Serve the frontend app
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Step 1: GetEndPoint
app.get('/getendpoint', async (req, res) => {
  const { apikey, appid } = req.query;
  const url = `${AIM_STATIC_BASE}/GetEndPoint`;
  console.log('GetEndPoint call:', url);
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'APIKey': apikey, 'AppId': appid }
    });
    const text = await response.text();
    try { res.status(response.status).json(JSON.parse(text)); }
    catch { res.status(response.status).send(text); }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Step 4: Security/Login
app.all('/security', async (req, res) => {
  const { apikey, appid, oauthtoken, username, password, endpointdomain } = req.query;
  const baseUrl = (endpointdomain || AIM_STATIC_BASE).replace(/\/$/, '');
  const url = `${baseUrl}/Api/Security?AppId=${encodeURIComponent(appid)}&UserName=${encodeURIComponent(username)}&Password=${encodeURIComponent(password)}`;
  console.log('Security call:', url);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'APIKey': apikey,
        'OAuthToken': oauthtoken,
        'Content-Type': 'application/json'
      }
    });
    const text = await response.text();
    try { res.status(response.status).json(JSON.parse(text)); }
    catch { res.status(response.status).send(text); }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// All secured AIM API calls
app.all('/api', async (req, res) => {
  const { apikey, appid, oauthtoken, token, endpointdomain, path: apiPath, ...rest } = req.query;
  const baseUrl = (endpointdomain || 'https://sandbox.active-e.net').replace(/\/$/, '');
  const queryParams = new URLSearchParams(rest).toString();
  const url = `${baseUrl}/Api/${apiPath}${queryParams ? '?' + queryParams : ''}`;
  console.log('API call:', req.method, url);
  try {
    const response = await fetch(url, {
      method: req.method,
      headers: {
        'APIKey': apikey,
        'AppId': appid,
        'OAuthToken': oauthtoken,
        'Token': token,
        'Content-Type': 'application/json'
      },
      ...(req.method !== 'GET' && { body: JSON.stringify(req.body) })
    });
    const text = await response.text();
    try { res.status(response.status).json(JSON.parse(text)); }
    catch { res.status(response.status).send(text); }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// AI proxy route
app.post('/ai', async (req, res) => {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(req.body)
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Metadata
app.get('/metadata', async (req, res) => {
  try {
    const response = await fetch(`${AIM_STATIC_BASE}/metadata`);
    const text = await response.text();
    try { res.status(response.status).json(JSON.parse(text)); }
    catch { res.status(response.status).send(text); }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'AIM Proxy v5' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`AIM Proxy v5 running on port ${PORT}`));
