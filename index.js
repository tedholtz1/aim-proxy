const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');
const { google } = require('googleapis');

const app = express();
app.use(cors());
app.use(express.json());

const AIM_STATIC_BASE = 'https://active-ewebservice.biz/aeServices30/api';
const SHEET_ID = '1TPlzM5rPkI2HPKJxkC7zAdkzHxw1bqoOninfb0SS4Xg';

// Google Sheets auth
async function getSheetsClient() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
  });
  return google.sheets({ version: 'v4', auth });
}

// Get route schedule from Google Sheets
app.get('/route', async (req, res) => {
  try {
    const sheets = await getSheetsClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'Sheet1!A:C'
    });

    const rows = response.data.values || [];
    const schools = rows
      .slice(1)
      .filter(row => row[1] && row[2])
      .map(row => ({
        district: row[0] || '',
        name: row[1],
        visitDay: row[2]
      }));

    const { day } = req.query;
    const days = {
      'Mon': 'Monday', 'Tue': 'Tuesday', 'Wed': 'Wednesday',
      'Thur': 'Thursday', 'Fri': 'Friday'
    };

    const todayAbbr = day || ['Sun','Mon','Tue','Wed','Thur','Fri','Sat'][new Date().getDay()];

    const todaysSchools = schools.filter(s =>
      s.visitDay.split(',').map(d => d.trim()).includes(todayAbbr)
    );

    res.json({
      today: days[todayAbbr] || todayAbbr,
      dayAbbr: todayAbbr,
      schools: todaysSchools,
      allSchools: schools
    });
  } catch (err) {
    console.error('Sheets error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Serve the frontend app
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Step 1: GetEndPoint
app.get('/getendpoint', async (req, res) => {
  const { apikey, appid } = req.query;
  const url = `${AIM_STATIC_BASE}/GetEndPoint`;
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

// Security/Login
app.all('/security', async (req, res) => {
  const { apikey, appid, oauthtoken, username, password, endpointdomain } = req.query;
  const baseUrl = (endpointdomain || AIM_STATIC_BASE).replace(/\/$/, '');
  const url = `${baseUrl}/Api/Security?AppId=${encodeURIComponent(appid)}&UserName=${encodeURIComponent(username)}&Password=${encodeURIComponent(password)}`;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'APIKey': apikey, 'OAuthToken': oauthtoken, 'Content-Type': 'application/json' }
    });
    const text = await response.text();
    try { res.status(response.status).json(JSON.parse(text)); }
    catch { res.status(response.status).send(text); }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// AIM API calls
app.all('/api', async (req, res) => {
  const { apikey, appid, oauthtoken, token, endpointdomain, path: apiPath, ...rest } = req.query;
  const baseUrl = (endpointdomain || 'https://sandbox.active-e.net').replace(/\/$/, '');
  const queryParams = new URLSearchParams(rest).toString();
  const url = `${baseUrl}/Api/${apiPath}${queryParams ? '?' + queryParams : ''}`;
  try {
    const response = await fetch(url, {
      method: req.method,
      headers: {
        'APIKey': apikey, 'AppId': appid,
        'OAuthToken': oauthtoken, 'Token': token,
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

// AI proxy
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

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'AIM Proxy v6' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`AIM Proxy v6 running on port ${PORT}`));
