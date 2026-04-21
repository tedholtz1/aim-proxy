const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
app.use(cors());
app.use(express.json());

const AIM_STATIC_BASE = 'https://active-ewebservice.biz/aeServices30/api';

// Step 1: GetEndPoint — returns NewEndpointDomain + OAuthToken
app.get('/getendpoint', async (req, res) => {
  const { apikey, appid } = req.query;
  const url = `${AIM_STATIC_BASE}/GetEndPoint`;

  console.log('GetEndPoint call:', url);
  console.log('APIKey:', apikey, 'AppId:', appid);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'APIKey': apikey,
        'AppId': appid
      }
    });
    const text = await response.text();
    console.log('GetEndPoint raw response:', text);
    try {
      res.status(response.status).json(JSON.parse(text));
    } catch {
      res.status(response.status).send(text);
    }
  } catch (err) {
    console.error('GetEndPoint error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Step 4: Security/Login — POST to NewEndpointDomain/Api/Security
// AppId, UserName, Password as query params; APIKey + OAuthToken as headers
app.post('/security', async (req, res) => {
  const { apikey, appid, oauthtoken, username, password, endpointdomain } = req.query;
  
  const baseUrl = endpointdomain || AIM_STATIC_BASE;
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
    console.log('Security raw response:', text);
    try {
      res.status(response.status).json(JSON.parse(text));
    } catch {
      res.status(response.status).send(text);
    }
  } catch (err) {
    console.error('Security error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Step 6: All other secured API calls
// APIKey, OAuthToken, AppId, Token as headers
// endpointdomain + path passed as query params
app.all('/api', async (req, res) => {
  const { apikey, appid, oauthtoken, token, endpointdomain, path, ...rest } = req.query;

  const baseUrl = endpointdomain || AIM_STATIC_BASE;
  const queryParams = new URLSearchParams(rest).toString();
  const url = `${baseUrl}/Api/${path}${queryParams ? '?' + queryParams : ''}`;

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
    console.log('API raw response:', text.substring(0, 300));
    try {
      res.status(response.status).json(JSON.parse(text));
    } catch {
      res.status(response.status).send(text);
    }
  } catch (err) {
    console.error('API error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Metadata (no auth needed)
app.get('/metadata', async (req, res) => {
  try {
    const response = await fetch(`${AIM_STATIC_BASE}/metadata`);
    const text = await response.text();
    try {
      res.status(response.status).json(JSON.parse(text));
    } catch {
      res.status(response.status).send(text);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'AIM Proxy v2' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`AIM Proxy v2 running on port ${PORT}`));
