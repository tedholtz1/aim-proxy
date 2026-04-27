const express = require(‘express’);
const cors = require(‘cors’);
const fetch = require(‘node-fetch’);
const path = require(‘path’);
const { google } = require(‘googleapis’);

const app = express();
app.use(cors());
app.use(express.json());

const AIM_STATIC_BASE = ‘https://active-ewebservice.biz/aeServices30/api’;
const ROUTE_SHEET_ID = ‘1TPlzM5rPkI2HPKJxkC7zAdkzHxw1bqoOninfb0SS4Xg’;
const DIRECTOR_SHEET_ID = ‘1TPlzM5rPkI2HPKJxkC7zAdkzHxw1bqoOninfb0SS4Xg’; // update when Nikki shares
const CALENDAR_SHEET_ID = ‘1TPlzM5rPkI2HPKJxkC7zAdkzHxw1bqoOninfb0SS4Xg’; // update when Nikki shares

async function getSheetsClient() {
const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
const auth = new google.auth.GoogleAuth({
credentials,
scopes: [‘https://www.googleapis.com/auth/spreadsheets.readonly’]
});
return google.sheets({ version: ‘v4’, auth });
}

// Serve frontend
app.get(’/’, (req, res) => {
res.sendFile(path.join(__dirname, ‘public’, ‘index.html’));
});

// Route schedule
app.get(’/route’, async (req, res) => {
try {
const sheets = await getSheetsClient();
const response = await sheets.spreadsheets.values.get({
spreadsheetId: ROUTE_SHEET_ID,
range: ‘Sheet1!A:C’
});
const rows = response.data.values || [];
const schools = rows.slice(1).filter(r => r[1] && r[2]).map(r => ({
district: r[0] || ‘’,
name: r[1],
visitDay: r[2]
}));
const days = [‘Sun’,‘Mon’,‘Tue’,‘Wed’,‘Thur’,‘Fri’,‘Sat’];
const todayAbbr = days[new Date().getDay()];
const todaysSchools = schools.filter(s =>
s.visitDay.split(’,’).map(d => d.trim()).includes(todayAbbr)
);
const dayNames = { Mon:‘Monday’, Tue:‘Tuesday’, Wed:‘Wednesday’, Thur:‘Thursday’, Fri:‘Friday’ };
res.json({
today: dayNames[todayAbbr] || todayAbbr,
dayAbbr: todayAbbr,
schools: todaysSchools,
allSchools: schools
});
} catch (err) {
res.status(500).json({ error: err.message });
}
});

// Recruiting calendar
app.get(’/calendar’, async (req, res) => {
try {
const sheets = await getSheetsClient();
// Get list of sheet tabs first
const meta = await sheets.spreadsheets.get({ spreadsheetId: CALENDAR_SHEET_ID });
const sheetNames = meta.data.sheets.map(s => s.properties.title);
// Find the most recent year tab (2026 or similar)
const yearTab = sheetNames.find(n => /20\d\d/.test(n)) || sheetNames[0];
const response = await sheets.spreadsheets.values.get({
spreadsheetId: CALENDAR_SHEET_ID,
range: `${yearTab}!A:P`
});
const rows = response.data.values || [];
if (rows.length === 0) { res.json({ events: [] }); return; }
const headers = rows[0].map(h => h?.toLowerCase().trim().replace(/\s+/g,’*’) || ‘’);
const events = rows.slice(1).filter(r => r[0]).map(r => {
const obj = {};
headers.forEach((h, i) => { if (h) obj[h] = r[i] || ‘’; });
return obj;
});
// Also check delivery dates tab
let deliveries = [];
const delivTab = sheetNames.find(n => n.toLowerCase().includes(‘deliver’));
if (delivTab) {
const dr = await sheets.spreadsheets.values.get({
spreadsheetId: CALENDAR_SHEET_ID,
range: `${delivTab}!A:Z`
});
const drows = dr.data.values || [];
if (drows.length > 0) {
const dhdrs = drows[0].map(h => h?.toLowerCase().trim().replace(/\s+/g,’*’) || ‘’);
deliveries = drows.slice(1).filter(r => r[0]).map(r => {
const obj = { _type: ‘delivery’ };
dhdrs.forEach((h, i) => { if (h) obj[h] = r[i] || ‘’; });
return obj;
});
}
}
res.json({ events, deliveries, tab: yearTab, allTabs: sheetNames });
} catch (err) {
res.status(500).json({ error: err.message });
}
});

// AIM GetEndPoint
app.get(’/getendpoint’, async (req, res) => {
const { apikey, appid } = req.query;
try {
const response = await fetch(`${AIM_STATIC_BASE}/GetEndPoint`, {
method: ‘GET’,
headers: { ‘APIKey’: apikey, ‘AppId’: appid }
});
const text = await response.text();
try { res.status(response.status).json(JSON.parse(text)); } catch { res.status(response.status).send(text); }
} catch (err) { res.status(500).json({ error: err.message }); }
});

// AIM Security
app.all(’/security’, async (req, res) => {
const { apikey, appid, oauthtoken, username, password, endpointdomain } = req.query;
const baseUrl = (endpointdomain || AIM_STATIC_BASE).replace(//$/, ‘’);
const url = `${baseUrl}/Api/Security?AppId=${encodeURIComponent(appid)}&UserName=${encodeURIComponent(username)}&Password=${encodeURIComponent(password)}`;
try {
const response = await fetch(url, {
method: ‘POST’,
headers: { ‘APIKey’: apikey, ‘OAuthToken’: oauthtoken, ‘Content-Type’: ‘application/json’ }
});
const text = await response.text();
try { res.status(response.status).json(JSON.parse(text)); } catch { res.status(response.status).send(text); }
} catch (err) { res.status(500).json({ error: err.message }); }
});

// AIM API calls
app.all(’/api’, async (req, res) => {
const { apikey, appid, oauthtoken, token, endpointdomain, path: apiPath, …rest } = req.query;
const baseUrl = (endpointdomain || ‘https://sandbox.active-e.net’).replace(//$/, ‘’);
const queryParams = new URLSearchParams(rest).toString();
const url = `${baseUrl}/Api/${apiPath}${queryParams ? '?' + queryParams : ''}`;
try {
const response = await fetch(url, {
method: req.method,
headers: {
‘APIKey’: apikey, ‘AppId’: appid,
‘OAuthToken’: oauthtoken, ‘Token’: token,
‘Content-Type’: ‘application/json’
},
…(req.method !== ‘GET’ && { body: JSON.stringify(req.body) })
});
const text = await response.text();
try { res.status(response.status).json(JSON.parse(text)); } catch { res.status(response.status).send(text); }
} catch (err) { res.status(500).json({ error: err.message }); }
});

// AI proxy
app.post(’/ai’, async (req, res) => {
try {
const response = await fetch(‘https://api.anthropic.com/v1/messages’, {
method: ‘POST’,
headers: {
‘Content-Type’: ‘application/json’,
‘x-api-key’: process.env.ANTHROPIC_API_KEY,
‘anthropic-version’: ‘2023-06-01’
},
body: JSON.stringify(req.body)
});
const data = await response.json();
res.status(response.status).json(data);
} catch (err) { res.status(500).json({ error: err.message }); }
});

// Metadata
app.get(’/metadata’, async (req, res) => {
try {
const response = await fetch(`${AIM_STATIC_BASE}/metadata`);
const text = await response.text();
try { res.status(response.status).json(JSON.parse(text)); } catch { res.status(response.status).send(text); }
} catch (err) { res.status(500).json({ error: err.message }); }
});

app.get(’/health’, (req, res) => res.json({ status: ‘ok’, service: ‘AIM Proxy v7’ }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`AIM Proxy v7 running on port ${PORT}`));
