const express = require('express');
const { body, param, query } = require('express-validator');
const mongoose = require('mongoose');
const {
    createInterestCategory, getAllInterestCategories, updateInterestCategory, deleteInterestCategory,
    upsertInterestCategoryTranslation, upsertInterestTranslation, 
    createInterest, getAllInterestsAdmin, getInterestByIdAdmin, updateInterest, archiveInterest, restoreInterest
} = require('../controllers/adminInterestsController');
const { protectAdmin, authorizeAdminRole } = require('../middleware/adminAuthMiddleware');

const router = express.Router();
router.use(protectAdmin);

// --- Validation Rules ---

const idValidation = (field) => param(field).isMongoId().withMessage(`Invalid ${field} format`);

const langValidation = param('lang')
    .trim()
    .matches(/^[a-z]{2,3}(-[a-z]{2})?$/i)
    .withMessage('Invalid language code');

const categoryBodyValidation = [
    body('name').trim().isLength({ min: 1, max: 100 }).escape(),
    body('description').optional({ checkFalsy: true }).trim().isLength({ max: 500 }).escape()
];

const interestBodyValidation = [
    body('name').trim().isLength({ min: 1, max: 100 }).escape(),
    body('categoryId').optional({ checkFalsy: true }).custom(val => {
        if (!val) return true;
        if (!mongoose.Types.ObjectId.isValid(val)) throw new Error('Invalid Category ID');
        return true;
    }),
    body('description').optional({ checkFalsy: true }).trim().isLength({ max: 500 }).escape()
];

const queryValidation = [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('categoryId').optional().isMongoId(),
    query('name').optional().trim().escape(),
    query('showArchived').optional().isBoolean().toBoolean()
];

// --- Routes: Categories ---

router.route('/categories')
    .post(
        authorizeAdminRole(['admin', 'superadmin']), 
        [body('name').notEmpty(), ...categoryBodyValidation], 
        createInterestCategory
    )
    .get(authorizeAdminRole(['admin', 'superadmin', 'moderator']), getAllInterestCategories);

router.route('/categories/:categoryId')
    .put(
        authorizeAdminRole(['admin', 'superadmin']), 
        [idValidation('categoryId'), ...categoryBodyValidation], 
        updateInterestCategory
    )
    .delete(authorizeAdminRole(['superadmin']), idValidation('categoryId'), deleteInterestCategory);

router.patch(
    '/categories/:categoryId/translations/:lang',
    authorizeAdminRole(['admin', 'superadmin']),
    [idValidation('categoryId'), langValidation, body('name').notEmpty(), ...categoryBodyValidation],
    upsertInterestCategoryTranslation
);

// --- Routes: Interests ---

router.route('/')
    .post(
        authorizeAdminRole(['admin', 'superadmin']), 
        [body('name').notEmpty(), ...interestBodyValidation], 
        createInterest
    )
    .get(authorizeAdminRole(['admin', 'superadmin', 'moderator']), queryValidation, getAllInterestsAdmin);

router.route('/:interestId')
    .get(authorizeAdminRole(['admin', 'superadmin', 'moderator']), idValidation('interestId'), getInterestByIdAdmin)
    .put(
        authorizeAdminRole(['admin', 'superadmin']), 
        [idValidation('interestId'), ...interestBodyValidation, body('isArchived').optional().isBoolean().toBoolean()], 
        updateInterest
    )
    .delete(authorizeAdminRole(['admin', 'superadmin']), idValidation('interestId'), archiveInterest);

router.put('/:interestId/restore', authorizeAdminRole(['admin', 'superadmin']), idValidation('interestId'), restoreInterest);

router.patch(
    '/:interestId/translations/:lang',
    authorizeAdminRole(['admin', 'superadmin']),
    [idValidation('interestId'), langValidation, body('name').notEmpty(), ...interestBodyValidation],
    upsertInterestTranslation
);

module.exports = router;