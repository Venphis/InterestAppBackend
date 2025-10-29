// routes/userRoutes.js
const express = require('express');
const multer = require('multer');
const { body, param, query } = require('express-validator');
const { protect } = require('../middleware/authMiddleware');
const { uploadAvatar } = require('../middleware/uploadMiddleware');
const {
    getUserProfile, updateUserProfile, updateUserAvatar, findUsers,
    addUserInterest, updateUserInterest, removeUserInterest, getUserById
} = require('../controllers/userController');
const router = express.Router();

router.use(protect); // Zastosuj middleware `protect` do wszystkich tras poniżej

// --- TRASY ZE STAŁYMI SEGMENTAMI (PRZED DYNAMICZNYMI) ---

// Trasa dla profilu zalogowanego użytkownika
router.route('/profile')
    .get(getUserProfile)
    .put([
        body('profile.displayName').optional({ checkFalsy: true }).trim().isLength({ min: 1, max: 50 }).withMessage('Display name must be between 1-50 chars').escape(),
        body('profile.gender').optional().isIn(['male', 'female', 'other', 'prefer_not_to_say', '']),
        body('profile.birthDate').optional({ checkFalsy: true }).isISO8601().toDate().withMessage('Invalid birth date format'),
        body('profile.location').optional({ checkFalsy: true }).trim().isLength({ max: 100 }).escape(),
        body('profile.bio').optional({ checkFalsy: true }).trim().isLength({ max: 500 }).escape(),
        body('profile.broadcastMessage').optional({ checkFalsy: true }).trim().isLength({ max: 280 }).escape()
    ], updateUserProfile);

// Trasy dla avatara i zainteresowań (zagnieżdżone pod /profile)
router.put('/profile/avatar', (req, res, next) => {
    uploadAvatar.single('avatarImage')(req, res, (err) => {
        if (err) {
            if (err instanceof multer.MulterError) {
                if (err.code === 'LIMIT_FILE_SIZE') {
                    return res.status(400).json({ message: 'File too large. Maximum size is 5MB.' });
                }
                return res.status(400).json({ message: err.message });
            } else if (err) {
                if (err.message === 'Not an image! Please upload only images.') {
                     return res.status(400).json({ message: 'Not an image! Please upload only images.' });
                }
                return res.status(400).json({ message: err.message });
            }
        }
        next();
    });
}, updateUserAvatar);

const userInterestIdValidation = [param('userInterestId').isMongoId().withMessage('Invalid UserInterest ID')];

router.post('/profile/interests', [
    body('interestId').isMongoId().withMessage('Valid Interest ID is required'),
    body('customDescription').optional({ checkFalsy: true }).trim().isLength({ max: 200 }).withMessage('Description max 200 chars').escape()
], addUserInterest);

router.put('/profile/interests/:userInterestId', [
    ...userInterestIdValidation,
    body('customDescription').optional({ checkFalsy: true }).trim().isLength({ max: 200 }).withMessage('Description max 200 chars').escape()
], updateUserInterest);

router.delete('/profile/interests/:userInterestId', userInterestIdValidation, removeUserInterest);


// Trasa do wyszukiwania użytkowników (stały segment 'search')
router.get('/search', [
    query('q').notEmpty().withMessage('Search query "q" is required').isString().trim().isLength({min: 1, max: 50}).escape()
], findUsers);


// --- TRASA Z DYNAMICZNYM PARAMETREM (NA KOŃCU) ---

// Trasa do pobierania profilu DOWOLNEGO użytkownika po ID
router.get('/:id', [
    param('id').isMongoId().withMessage('Invalid User ID format') // Dodaj walidację
], getUserById);


module.exports = router;