// routes/adminAuthRoutes.js
const express = require('express');
const { loginAdmin, getAdminMe } = require('../controllers/adminAuthController');
const { protectAdmin } = require('../middleware/adminAuthMiddleware');
const router = express.Router();

router.post('/login', loginAdmin);
router.get('/me', protectAdmin, getAdminMe); // Trasa do pobrania danych o zalogowanym adminie

module.exports = router;