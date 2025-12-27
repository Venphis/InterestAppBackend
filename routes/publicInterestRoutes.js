const express = require('express');
const { query } = require('express-validator');
const { getPublicInterestCategories, getPublicInterests } = require('../controllers/publicInterestController');
const router = express.Router();

router.get('/categories', [
  query('lang').optional().matches(/^[a-z]{2,3}(-[a-z]{2})?$/i).withMessage('Invalid lang. Example: en, de, en-us')
], getPublicInterestCategories);

router.get('/', [
  query('lang').optional().matches(/^[a-z]{2,3}(-[a-z]{2})?$/i).withMessage('Invalid lang. Example: en, de, en-us'),
  query('categoryId').optional().isMongoId().withMessage('Invalid Category ID format'),
  query('name').optional().isString().trim().escape().isLength({ min: 1, max: 100 }).withMessage('Name search query must be 1-100 characters')
], getPublicInterests);

module.exports = router;
