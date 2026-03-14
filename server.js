import express from 'express';
import cors from 'cors';
import { createClient } from 'hafas-client';
import { profile as insaProfile } from 'hafas-client/p/insa/index.js';
import { loadGtfs, tramRouteData } from './gtfs.js';

const hafas = createClient(insaProfile, 'leipzig-tram-tracker');
const app = express();

app.use(cors());
app.use(express.static('public'));

// GET /api/stations?q=<query>
app.get('/api/stations', async (req, res) => {
  const { q } = req.query;
  if (!q || q.trim().length < 2) {
    return res.status(400).json({ error: 'Query must be at least 2 characters' });
  }
  try {
    const results = await hafas.locations(q.trim(), {
      results: 10,
      stops: true,
      addresses: false,
      poi: false,
    });
    res.json(results);
  } catch (err) {
    console.error('stations error:', err.message);
    res.status(502).json({ error: 'Failed to search stations', detail: err.message });
  }
});

// GET /api/departures?id=<stationId>&duration=30&products=tram,suburban,bus
app.get('/api/departures', async (req, res) => {
  const { id, duration = '30', products: productsParam } = req.query;
  if (!id) {
    return res.status(400).json({ error: 'Missing station id' });
  }

  // Build products filter — always suppress long-distance/regional trains
  const products = { nationalExpress: false, national: false, regionalExp: false, regional: false };
  if (productsParam) {
    const active = new Set(productsParam.split(','));
    products.tram     = active.has('tram');
    products.suburban = active.has('suburban');
    products.bus      = active.has('bus');
  }

  try {
    const result = await hafas.departures(id, {
      duration: parseInt(duration, 10),
      results: 40,
      products,
    });
    res.json(result.departures ?? result);
  } catch (err) {
    console.error('departures error:', err.message);
    res.status(502).json({ error: 'Failed to fetch departures', detail: err.message });
  }
});

// GET /api/nearby?lat=<lat>&lng=<lng>
app.get('/api/nearby', async (req, res) => {
  const { lat, lng } = req.query;
  if (!lat || !lng) {
    return res.status(400).json({ error: 'Missing lat or lng' });
  }
  try {
    const results = await hafas.nearby(
      { type: 'location', latitude: parseFloat(lat), longitude: parseFloat(lng) },
      { results: 10, distance: 500, stops: true, poi: false }
    );
    res.json(results);
  } catch (err) {
    console.error('nearby error:', err.message);
    res.status(502).json({ error: 'Failed to fetch nearby stops', detail: err.message });
  }
});

// GET /api/tram-route/:line — GTFS route geometry + stops
app.get('/api/tram-route/:line', (req, res) => {
  const data = tramRouteData.get(req.params.line);
  if (!data) return res.status(404).json({ error: `No route data for line ${req.params.line}` });
  res.json(data);
});

const PORT = process.env.PORT || 3000;

// Load GTFS then start listening
loadGtfs()
  .then(() => app.listen(PORT, () => console.log(`Leipzig tram tracker running on http://localhost:${PORT}`)))
  .catch(err => {
    console.error('GTFS load failed:', err.message);
    console.warn('Starting without GTFS route data');
    app.listen(PORT, () => console.log(`Leipzig tram tracker running on http://localhost:${PORT}`));
  });
