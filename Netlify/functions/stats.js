/* ==========================================
   netlify/functions/stats.js
   Serverless API voor dartcounter statistieken.
   Gebruikt Netlify Blobs als persistente opslag.

   Endpoints:
     GET  /.netlify/functions/stats        → laad alle stats
     POST /.netlify/functions/stats        → overschrijf alle stats

   Optionele beveiliging:
     Stel STATS_API_KEY in als environment variable in Netlify
     (Site settings → Environment variables).
     Voeg dezelfde waarde in in stats.js → CLOUD_API_KEY.
   ========================================== */

const { getStore } = require('@netlify/blobs');

const STORE_NAME = 'dartcounter';
const BLOB_KEY   = 'stats-v1';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type':                 'application/json',
};

exports.handler = async (event) => {
  // CORS preflight (browsers sturen dit voor POST)
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS };
  }

  // ── Optionele API-key check ───────────────────────────
  const vereistKey = process.env.STATS_API_KEY;
  if (vereistKey) {
    const meegegeven = event.headers['x-api-key'] || event.headers['X-API-Key'];
    if (meegegeven !== vereistKey) {
      return {
        statusCode: 401,
        headers:    CORS_HEADERS,
        body:       JSON.stringify({ error: 'Onbevoegd — stel CLOUD_API_KEY in in stats.js' }),
      };
    }
  }

  // ── GET: laad stats ───────────────────────────────────
  if (event.httpMethod === 'GET') {
    try {
      const store = getStore(STORE_NAME);
      const data  = await store.get(BLOB_KEY, { type: 'text' });
      return {
        statusCode: 200,
        headers:    CORS_HEADERS,
        body:       data || '{}',
      };
    } catch (e) {
      // Blob bestaat nog niet (eerste keer) → lege object teruggeven
      return { statusCode: 200, headers: CORS_HEADERS, body: '{}' };
    }
  }

  // ── POST: sla stats op ────────────────────────────────
  if (event.httpMethod === 'POST') {
    try {
      const body = event.body || '{}';
      JSON.parse(body); // valideer JSON voordat we opslaan
      const store = getStore(STORE_NAME);
      await store.set(BLOB_KEY, body);
      return {
        statusCode: 200,
        headers:    CORS_HEADERS,
        body:       JSON.stringify({ ok: true }),
      };
    } catch (e) {
      return {
        statusCode: 400,
        headers:    CORS_HEADERS,
        body:       JSON.stringify({ error: 'Ongeldige JSON of opslag mislukt: ' + e.message }),
      };
    }
  }

  return {
    statusCode: 405,
    headers:    CORS_HEADERS,
    body:       JSON.stringify({ error: 'Methode niet toegestaan' }),
  };
};
