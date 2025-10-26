const express = require('express');
const { issueCertificate } = require('../controllers/certificateController');
const { protect } = require('../middleware/authMiddleware');
const router = express.Router();

router.post('/issue', protect, issueCertificate);

module.exports = router;
