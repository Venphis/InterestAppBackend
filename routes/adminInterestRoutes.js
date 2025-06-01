// routes/adminInterestRoutes.js
const express = require('express');
const { body, param, query } = require('express-validator');
const mongoose = require('mongoose'); // Potrzebne dla mongoose.Types.ObjectId.isValid
const {
    createInterestCategory, getAllInterestCategories, updateInterestCategory, deleteInterestCategory,
    createInterest, getAllInterestsAdmin, updateInterest, archiveInterest, restoreInterest
} = require('../controllers/adminInterestsController');
const { protectAdmin, authorizeAdminRole } = require('../middleware/adminAuthMiddleware');

const router = express.Router();
router.use(protectAdmin);

const categoryIdValidation = [param('categoryId').isMongoId().withMessage('Invalid Category ID format.')];
const interestIdValidation = [param('interestId').isMongoId().withMessage('Invalid Interest ID format.')];

router.route('/categories')
    .post(authorizeAdminRole(['admin', 'superadmin']), [
        body('name').trim().notEmpty().withMessage('Category name is required.').isLength({min: 1, max: 100}).withMessage('Category name must be 1-100 characters.').escape(),
        body('description').optional({checkFalsy: true}).trim().isLength({max: 500}).withMessage('Category description max 500 chars.').escape()
    ], createInterestCategory)
    .get(authorizeAdminRole(['admin', 'superadmin', 'moderator']), getAllInterestCategories);

router.route('/categories/:categoryId')
    .put(authorizeAdminRole(['admin', 'superadmin']), [
        ...categoryIdValidation,
        body('name').optional({checkFalsy: true}).trim().isLength({min: 1, max: 100}).withMessage('Category name must be 1-100 characters.').escape(),
        body('description').optional({checkFalsy: true}).trim().isLength({max: 500}).withMessage('Category description max 500 chars.').escape()
    ], updateInterestCategory)
    .delete(authorizeAdminRole(['superadmin']), categoryIdValidation, deleteInterestCategory);

router.route('/') // Dla /api/admin/interests
    .post(authorizeAdminRole(['admin', 'superadmin']), [
        body('name').trim().notEmpty().withMessage('Interest name is required.').isLength({min: 1, max: 100}).withMessage('Interest name must be 1-100 characters.').escape(),
        body('categoryId').optional({checkFalsy: true}).isMongoId().withMessage('Invalid Category ID format for interest.'),
        body('description').optional({checkFalsy: true}).trim().isLength({max: 500}).withMessage('Interest description max 500 chars.').escape()
    ], createInterest)
    .get(authorizeAdminRole(['admin', 'superadmin', 'moderator']), [
        query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer.').toInt(),
        query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100.').toInt(),
        query('categoryId').optional().isMongoId().withMessage('Invalid Category ID format for filter.'),
        query('name').optional().isString().trim().escape().isLength({max:100}).withMessage('Name filter too long.'),
        query('showArchived').optional().isBoolean().withMessage('showArchived must be a boolean.').toBoolean()
    ], getAllInterestsAdmin);

router.route('/:interestId')
    .put(authorizeAdminRole(['admin', 'superadmin']), [
        ...interestIdValidation,
        body('name').optional({checkFalsy: true}).trim().isLength({min:1, max: 100}).withMessage('Interest name must be 1-100 characters.').escape(),
        body('categoryId').optional({checkFalsy: true}).custom((value) => {
            if (value === '' || value === null) return true; // Pozwól na usunięcie kategorii
            if (!mongoose.Types.ObjectId.isValid(value)) throw new Error('Invalid Category ID format provided.'); // Błąd rzucony przez custom
            return true;
        }).withMessage('Invalid Category ID format for interest update.'), // Ogólny komunikat dla custom
        body('description').optional({checkFalsy: true}).trim().isLength({max: 500}).withMessage('Interest description max 500 chars.').escape(),
        body('isArchived').optional().isBoolean().withMessage('isArchived must be a boolean.').toBoolean()
    ], updateInterest)
    .delete(authorizeAdminRole(['admin', 'superadmin']), interestIdValidation, archiveInterest);

router.put('/:interestId/restore', authorizeAdminRole(['admin', 'superadmin']), interestIdValidation, restoreInterest);

module.exports = router;