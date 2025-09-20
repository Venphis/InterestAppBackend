const express = require('express');
const { query } = require('express-validator'); 
const { getPublicInterestCategories, getPublicInterests } = require('../controllers/publicInterestController');
const router = express.Router();

router.get('/categories', getPublicInterestCategories);

router.get('/', [ 
    query('categoryId').optional().isMongoId().withMessage('Invalid Category ID format'),
    query('name').optional().isString().trim().escape()
        .isLength({ min: 1, max: 100 }).withMessage('Name search query must be 1-100 characters')
], getPublicInterests);

module.exports = router;