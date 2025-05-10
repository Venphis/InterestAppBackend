// routes/reportRoutes.js
const express = require('express');
const { createReport } = require('../controllers/reportController');
const { protect } = require('../middleware/authMiddleware'); // Middleware dla zwykłych użytkowników

const router = express.Router();

// Zgłaszanie jest dostępne dla zalogowanych użytkowników
router.post('/', protect, createReport);

module.exports = router;