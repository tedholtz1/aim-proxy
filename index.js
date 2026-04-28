const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');
const { google } = require('googleapis');

const app = express();
app.use(cors());
app.use(express.json());

const AIM_BASE = 'https://active-ewebservice.biz/aeServices30/api';
const SHEET_ID = '1TPlzM5rPkI2HPKJxkC7zAdkzHxw1bqoOninfb0SS4Xg';

async function getSheets() {
  const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
  const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
  });
  return google.sheets({ version: 'v4', auth: auth });
}

app.get('/', function(req, res) {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/health', function(req, res) {
  res.json({ status: 'ok', version: 'v7' });
});

app.get('/route', async function(req, res) {
  try {
    const sheets = await getSheets();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'Sheet1!A:C'
    });
    const rows = response.data.values || [];
    const schools = rows.slice(1).filter(function(r) {
      return r[1] && r[2];
    }).map(function(r) {
      return { district: r[0] || '', name: r[1], visitDay: r[2] };
    });
    const dayAbbrs = ['Sun', 'Mon', 'Tue', 'Wed', 'Thur', 'Fri', 'Sat'];
    const todayAbbr = dayAbbrs[new Date().getDay()];
    const todaySchools = schools.filter(function(s) {
      return s.visitDay.split(',').map(function(d) { return d.trim(); }).indexOf(todayAbbr) >= 0;
    });
    const dayNames = { Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thur: 'Thursday', Fri: 'Friday' };
    res.json({
      today: dayNames[todayAbbr] || todayAbbr,
      dayAbbr: todayAbbr,
      schools: todaySchools,
      allSchools: schools
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/calendar', async function(req, res) {
  try {
    const sheets = await getSheets();
    const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
    const sheetNames = meta.data.sheets.map(function(s) { return s.properties.title; });
    const yearTab = sheetNames.find(function(n) { return /20\d\d/.test(n); }) || sheetNames[0];
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: yearTab + '!A:P'
    });
    const rows = response.data.values || [];
    if (rows.length === 0) { res.json({ events: [] }); return; }
    const headers = rows[0].map(function(h) {
      return (h || '').toLowerCase().trim().replace(/\s+/g, '_');
    });
    const events = rows.slice(1).filter(function(r) { return r[0]; }).map(function(r) {
      const obj = {};
      headers.forEach(function(h, i) { if (h) obj[h] = r[i] || ''; });
      return obj;
    });
    var deliveries = [];
    const delivTab = sheetNames.find(function(n) { return n.toLowerCase().indexOf('deliver') >= 0; });
    if (delivTab) {
      const dr = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: delivTab + '!A:Z'
      });
      const drows = dr.data.values || [];
      if (drows.length > 0) {
        const dhdrs = drows[0].map(function(h) { return (h || '').toLowerCase().trim().replace(/\s+/g, '_'); });
        deliveries = drows.slice(1).filter(function(r) { return r[0]; }).map(function(r) {
          const obj = { _type: 'delivery' };
          dhdrs.forEach(function(h, i) { if (h) obj[h] = r[i] || ''; });
          return obj;
        });
      }
    }
    res.json({ events: events, deliveries: deliveries, tab: yearTab, allTabs: sheetNames });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/getendpoint', async function(req, res) {
  const apikey = req.query.apikey;
  const appid = req.query.appid;
  try {
    const response = await fetch(AIM_BASE + '/GetEndPoint', {
      method: 'GET',
      headers: { 'APIKey': apikey, 'AppId': appid }
    });
    const text = await response.text();
    try { res.status(response.status).json(JSON.parse(text)); } catch(e) { res.status(response.status).send(text); }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.all('/security', async function(req, res) {
  const apikey = req.query.apikey;
  const appid = req.query.appid;
  const oauthtoken = req.query.oauthtoken;
  const username = req.query.username;
  const password = req.query.password;
  const endpointdomain = req.query.endpointdomain;
  const baseUrl = (endpointdomain || AIM_BASE).replace(/\/$/, '');
  const url = baseUrl + '/Api/Security?AppId=' + encodeURIComponent(appid) + '&UserName=' + encodeURIComponent(username) + '&Password=' + encodeURIComponent(password);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'APIKey': apikey, 'OAuthToken': oauthtoken, 'Content-Type': 'application/json' }
    });
    const text = await response.text();
    try { res.status(response.status).json(JSON.parse(text)); } catch(e) { res.status(response.status).send(text); }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.all('/api', async function(req, res) {
  const apikey = req.query.apikey;
  const appid = req.query.appid;
  const oauthtoken = req.query.oauthtoken;
  const token = req.query.token;
  const endpointdomain = req.query.endpointdomain;
  const apiPath = req.query.path;
  const rest = Object.assign({}, req.query);
  delete rest.apikey; delete rest.appid; delete rest.oauthtoken;
  delete rest.token; delete rest.endpointdomain; delete rest.path;
  const baseUrl = (endpointdomain || 'https://sandbox.active-e.net').replace(/\/$/, '');
  const queryStr = new URLSearchParams(rest).toString();
  const url = baseUrl + '/Api/' + apiPath + (queryStr ? '?' + queryStr : '');
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
      body: req.method !== 'GET' ? JSON.stringify(req.body) : undefined
    });
    const text = await response.text();
    try { res.status(response.status).json(JSON.parse(text)); } catch(e) { res.status(response.status).send(text); }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/ai', async function(req, res) {
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
  } catch (err) { res.status(500).json({ error: err.message }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, function() {
  console.log('AIM Proxy v7 running on port ' + PORT);
});
