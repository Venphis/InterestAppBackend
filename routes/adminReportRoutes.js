// routes/adminReportRoutes.js
const express = require('express');
const { getAllReports, getReportById, updateReport } = require('../controllers/adminReportsController');
const { protectAdmin, authorizeAdminRole } = require('../middleware/adminAuthMiddleware');

const router = express.Router();

router.use(protectAdmin); // Wszystkie trasy chronione dla adminów/moderatorów
router.use(authorizeAdminRole(['admin', 'superadmin', 'moderator'])); // Określ, kto ma dostęp

router.get('/', getAllReports);
router.get('/:reportId', getReportById);
router.put('/:reportId', updateReport);

module.exports = router;