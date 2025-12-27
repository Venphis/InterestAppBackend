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

const languageIdValidation = [
  param('languageId').isMongoId().withMessage('Invalid languageId'),
];

router.get(
  '/',
  authorizeAdminRole(['admin', 'superadmin']),
  [
    query('showArchived').optional().isBoolean().withMessage('showArchived must be boolean').toBoolean(),
  ],
  getLanguages
);

router.post(
  '/',
  authorizeAdminRole(['admin', 'superadmin']),
  [
    body('code').trim().matches(/^[a-z]{2,3}(-[a-z]{2})?$/i).withMessage('Invalid language code. Example: en, pl, de, en-us'),
    body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 60 }),
    body('nativeName').optional({ checkFalsy: true }).trim().isLength({ max: 60 }),
  ],
  createLanguage
);

router.get(
  '/:languageId',
  authorizeAdminRole(['admin', 'superadmin']),
  languageIdValidation,
  getLanguageById
);

router.put(
  '/:languageId',
  authorizeAdminRole(['admin', 'superadmin']),
  [
    ...languageIdValidation,
    body('code').optional().trim().matches(/^[a-z]{2,3}(-[a-z]{2})?$/i).withMessage('Invalid language code. Example: en, pl, de, en-us'),
    body('name').optional().trim().isLength({ min: 1, max: 60 }),
    body('nativeName').optional().trim().isLength({ max: 60 }),
    body('isArchived').optional().isBoolean().withMessage('isArchived must be boolean').toBoolean(),
  ],
  updateLanguage
);

// archiwizacja jak w Interests: DELETE archiwizuje, restore przywraca
router.delete(
  '/:languageId',
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
