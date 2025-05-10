// routes/adminInterestRoutes.js
const express = require('express');
const { body, param, query } = require('express-validator');
const {
    createInterestCategory, getAllInterestCategories, updateInterestCategory, deleteInterestCategory,
    createInterest, getAllInterestsAdmin, updateInterest, archiveInterest, restoreInterest // Zmieniono i dodano
} = require('../controllers/adminInterestsController');
const { protectAdmin, authorizeAdminRole } = require('../middleware/adminAuthMiddleware');

const router = express.Router();

router.use(protectAdmin);

const categoryIdValidation = [param('categoryId').isMongoId().withMessage('Invalid Category ID')];
const interestIdValidation = [param('interestId').isMongoId().withMessage('Invalid Interest ID')];

router.route('/categories')
    .post(authorizeAdminRole(['admin', 'superadmin']), [
        body('name').trim().notEmpty().withMessage('Category name is required').isLength({max: 100}).escape(),
        body('description').optional({checkFalsy: true}).trim().isLength({max: 500}).escape()
    ], createInterestCategory)
    .get(authorizeAdminRole(['admin', 'superadmin', 'moderator']), getAllInterestCategories);

router.route('/categories/:categoryId')
    .put(authorizeAdminRole(['admin', 'superadmin']), [
        ...categoryIdValidation,
        body('name').optional({checkFalsy: true}).trim().isLength({max: 100}).escape(),
        body('description').optional({checkFalsy: true}).trim().isLength({max: 500}).escape()
    ], updateInterestCategory)
    .delete(authorizeAdminRole(['superadmin']), categoryIdValidation, deleteInterestCategory);

router.route('/') // Dla /api/admin/interests
    .post(authorizeAdminRole(['admin', 'superadmin']), [
        body('name').trim().notEmpty().withMessage('Interest name is required').isLength({max: 100}).escape(),
        body('categoryId').optional({checkFalsy: true}).isMongoId().withMessage('Invalid Category ID for interest'),
        body('description').optional({checkFalsy: true}).trim().isLength({max: 500}).escape()
    ], createInterest)
    .get(authorizeAdminRole(['admin', 'superadmin', 'moderator']), [
        query('page').optional().isInt({ min: 1 }).toInt(),
        query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
        query('categoryId').optional().isMongoId(),
        query('name').optional().isString().trim().escape(),
        query('showArchived').optional().isBoolean().toBoolean()
    ], getAllInterestsAdmin);

router.route('/:interestId')
    .put(authorizeAdminRole(['admin', 'superadmin']), [
        ...interestIdValidation,
        body('name').optional({checkFalsy: true}).trim().isLength({max: 100}).escape(),
        body('categoryId').optional({checkFalsy: true}).custom((value) => { // Pozwól na pusty string lub null do usunięcia kategorii
            if (value === '' || value === null) return true;
            if (!mongoose.Types.ObjectId.isValid(value)) throw new Error('Invalid Category ID');
            return true;
        }),
        body('description').optional({checkFalsy: true}).trim().isLength({max: 500}).escape(),
        body('isArchived').optional().isBoolean().toBoolean()
    ], updateInterest)
    .delete(authorizeAdminRole(['admin', 'superadmin']), interestIdValidation, archiveInterest);

router.put('/:interestId/restore', authorizeAdminRole(['admin', 'superadmin']), interestIdValidation, restoreInterest);


module.exports = router;