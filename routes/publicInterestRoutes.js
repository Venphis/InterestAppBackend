const express = require('express');
const { query } = require('express-validator');
const { getPublicInterestCategories, getPublicInterests } = require('../controllers/publicInterestController');

const router = express.Router();

// --- Validation Rules ---

const langValidation = [
  query('lang').optional().matches(/^[a-z]{2,3}(-[a-z]{2})?$/i).withMessage('Invalid lang format')
];

const interestQueryValidation = [
  ...langValidation,
  query('categoryId').optional().isMongoId().withMessage('Invalid Category ID'),
  query('name').optional().trim().escape().isLength({ min: 1, max: 100 })
];

// --- Routes ---

router.get('/categories', langValidation, getPublicInterestCategories);
router.get('/', interestQueryValidation, getPublicInterests);

module.exports = router;