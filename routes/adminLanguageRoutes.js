const express = require('express');
const { body, param, query } = require('express-validator');
const {
  createLanguage,
  getLanguages,
  getLanguageById,
  updateLanguage,
  archiveLanguage,
  restoreLanguage,
} = require('../controllers/adminLanguagesController');
const { protectAdmin, authorizeAdminRole } = require('../middleware/adminAuthMiddleware');

const router = express.Router();
router.use(protectAdmin);

// --- Validation Rules ---

const languageIdValidation = [
  param('languageId').isMongoId().withMessage('Invalid languageId format')
];

const languageBodyValidation = [
  body('code').trim().matches(/^[a-z]{2,3}(-[a-z]{2})?$/i).withMessage('Invalid code format (e.g. en, en-us)'),
  body('name').trim().isLength({ min: 1, max: 60 }).withMessage('Name required (max 60 chars)'),
  body('nativeName').optional({ checkFalsy: true }).trim().isLength({ max: 60 })
];

const updateValidation = [
  ...languageIdValidation,
  body('code').optional().trim().matches(/^[a-z]{2,3}(-[a-z]{2})?$/i),
  body('name').optional().trim().isLength({ min: 1, max: 60 }),
  body('nativeName').optional().trim().isLength({ max: 60 }),
  body('isArchived').optional().isBoolean().toBoolean()
];

// --- Routes ---

router.route('/')
  .get(
    authorizeAdminRole(['admin', 'superadmin', 'moderator']),
    [query('showArchived').optional().isBoolean().toBoolean()],
    getLanguages
  )
  .post(
    authorizeAdminRole(['admin', 'superadmin']),
    languageBodyValidation,
    createLanguage
  );

router.route('/:languageId')
  .get(
    authorizeAdminRole(['admin', 'superadmin']),
    languageIdValidation,
    getLanguageById
  )
  .put(
    authorizeAdminRole(['admin', 'superadmin']),
    updateValidation,
    updateLanguage
  )
  .delete(
    authorizeAdminRole(['admin', 'superadmin']),
    languageIdValidation,
    archiveLanguage
  );

router.put(
  '/:languageId/restore',
  authorizeAdminRole(['admin', 'superadmin']),
  languageIdValidation,
  restoreLanguage
);

module.exports = router;