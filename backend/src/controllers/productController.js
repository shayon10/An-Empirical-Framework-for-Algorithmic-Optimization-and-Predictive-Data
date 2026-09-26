const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '../data/products.json');

let products = [];
try {
  const raw = fs.readFileSync(DATA_PATH, 'utf-8');
  products = JSON.parse(raw);
  console.log(`Loaded ${products.length} products into memory cache.`);
} catch (err) {
  console.error('Failed to load products.json, regenerating...', err);
  require('../data/generate_dataset');
  const raw = fs.readFileSync(DATA_PATH, 'utf-8');
  products = JSON.parse(raw);
}

// In-memory telemetry log for academic evaluations
const telemetryLogs = [];

// Helper to simulate network latency if requested via query or header
const applySimulatedDelay = async (req) => {
  const delayParam = req.query.delay || req.headers['x-simulated-delay'];
  if (delayParam) {
    const ms = parseInt(delayParam, 10);
    if (!isNaN(ms) && ms > 0) {
      await new Promise(resolve => setTimeout(resolve, ms));
    }
  }
};

exports.getProducts = async (req, res) => {
  await applySimulatedDelay(req);
  
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 24;
  const category = req.query.category;
  const search = req.query.search ? req.query.search.toLowerCase() : null;
  const sortBy = req.query.sortBy || 'id_asc';
  const minPrice = parseFloat(req.query.minPrice);
  const maxPrice = parseFloat(req.query.maxPrice);

  let filtered = [...products];

  if (category && category !== 'All') {
    filtered = filtered.filter(p => p.category.toLowerCase() === category.toLowerCase());
  }

  if (search) {
    filtered = filtered.filter(p => 
      p.name.toLowerCase().includes(search) || 
      p.brand.toLowerCase().includes(search) ||
      p.description.toLowerCase().includes(search)
    );
  }

  if (!isNaN(minPrice)) {
    filtered = filtered.filter(p => p.price >= minPrice);
  }
  if (!isNaN(maxPrice)) {
    filtered = filtered.filter(p => p.price <= maxPrice);
  }

  // Sorting
  switch (sortBy) {
    case 'price_asc':
      filtered.sort((a, b) => a.price - b.price);
      break;
    case 'price_desc':
      filtered.sort((a, b) => b.price - a.price);
      break;
    case 'rating_desc':
      filtered.sort((a, b) => b.rating - a.rating);
      break;
    case 'name_asc':
      filtered.sort((a, b) => a.name.localeCompare(b.name));
      break;
    default:
      filtered.sort((a, b) => a.id - b.id);
  }

  const total = filtered.length;
  const totalPages = Math.ceil(total / limit);
  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + limit;
  const paginatedData = filtered.slice(startIndex, endIndex);

  res.setHeader('X-Total-Count', total);
  res.setHeader('X-Server-Timestamp', Date.now());

  return res.json({
    status: 'success',
    meta: {
      page,
      limit,
      total,
      totalPages,
      category: category || 'All',
      sortBy
    },
    data: paginatedData
  });
};

exports.getProductById = async (req, res) => {
  await applySimulatedDelay(req);

  const id = parseInt(req.params.id, 10);
  const product = products.find(p => p.id === id);

  if (!product) {
    return res.status(404).json({
      status: 'error',
      message: `Product with ID ${req.params.id} not found.`
    });
  }

  // Find 4 related products in same category for prefetch experiments
  const related = products
    .filter(p => p.category === product.category && p.id !== product.id)
    .slice(0, 4);

  return res.json({
    status: 'success',
    data: product,
    related
  });
};

exports.getCategories = async (req, res) => {
  await applySimulatedDelay(req);

  const categoryMap = {};
  products.forEach(p => {
    categoryMap[p.category] = (categoryMap[p.category] || 0) + 1;
  });

  const categories = Object.keys(categoryMap).map(name => ({
    name,
    count: categoryMap[name]
  }));

  return res.json({
    status: 'success',
    data: categories
  });
};

exports.recordTelemetry = (req, res) => {
  const payload = req.body;
  if (!payload) {
    return res.status(400).json({ status: 'error', message: 'Empty body' });
  }

  const entry = {
    id: telemetryLogs.length + 1,
    timestamp: new Date().toISOString(),
    ...payload
  };

  telemetryLogs.push(entry);
  if (telemetryLogs.length > 5000) {
    telemetryLogs.shift();
  }

  return res.json({
    status: 'success',
    recordedId: entry.id,
    totalLogs: telemetryLogs.length
  });
};

exports.getTelemetry = (req, res) => {
  return res.json({
    status: 'success',
    totalEntries: telemetryLogs.length,
    data: telemetryLogs
  });
};

exports.clearTelemetry = (req, res) => {
  telemetryLogs.length = 0;
  return res.json({
    status: 'success',
    message: 'Telemetry log purged'
  });
};
