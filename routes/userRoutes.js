// routes/userRoutes.js
const express = require('express');
const { body, param, query } = require('express-validator');
const { protect } = require('../middleware/authMiddleware');
const { uploadAvatar } = require('../../middleware/uploadMiddleware');
const {
    getUserProfile, updateUserProfile, updateUserAvatar, findUsers,
    addUserInterest, updateUserInterest, removeUserInterest
} = require('../../controllers/userController');
const router = express.Router();

router.use(protect);

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

router.put('/profile/avatar', uploadAvatar.single('avatarImage'), updateUserAvatar);

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

router.get('/search', [
    query('q').notEmpty().withMessage('Search query "q" is required').isString().trim().isLength({min: 1, max: 50}).escape()
], findUsers);

module.exports = router;