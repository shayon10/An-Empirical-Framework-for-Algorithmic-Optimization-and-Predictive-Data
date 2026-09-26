const express = require('express');
const router = express.Router();
const controller = require('../controllers/productController');

// Catalog & Details
router.get('/products', controller.getProducts);
router.get('/products/:id', controller.getProductById);
router.get('/categories', controller.getCategories);

// Empirical Experiment Telemetry
router.post('/telemetry', controller.recordTelemetry);
router.get('/telemetry', controller.getTelemetry);
router.delete('/telemetry', controller.clearTelemetry);

module.exports = router;
