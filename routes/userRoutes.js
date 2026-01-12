const express = require('express');
const multer = require('multer');
const { body, param, query } = require('express-validator');
const { protect } = require('../middleware/authMiddleware');
const { uploadAvatar } = require('../middleware/uploadMiddleware');
const {
    getUserProfile, updateUserProfile, updateUserAvatar, findUsers,
    addUserInterest, updateUserInterest, removeUserInterest, getUserById, deleteOwnAccount
} = require('../controllers/userController');

const router = express.Router();
router.use(protect);

// --- Validation Rules ---

const profileUpdateValidation = [
    body('profile.displayName').optional({ checkFalsy: true }).trim().isLength({ min: 1, max: 50 }).escape(),
    body('profile.gender').optional().isIn(['male', 'female', 'other', 'prefer_not_to_say', '']),
    body('profile.birthDate').optional({ checkFalsy: true }).isISO8601().toDate(),
    body('profile.location').optional({ checkFalsy: true }).trim().isLength({ max: 100 }).escape(),
    body('profile.bio').optional({ checkFalsy: true }).trim().isLength({ max: 500 }).escape(),
    body('profile.broadcastMessage').optional({ checkFalsy: true }).trim().isLength({ max: 280 }).escape()
];

const interestValidation = [
    body('interestId').isMongoId().withMessage('Valid Interest ID required'),
    body('customDescription').optional({ checkFalsy: true }).trim().isLength({ max: 200 }).escape()
];

const interestIdValidation = [
    param('userInterestId').isMongoId().withMessage('Invalid UserInterest ID')
];

const searchValidation = [
    query('q').notEmpty().withMessage('Query required').trim().isLength({ min: 1, max: 50 }).escape()
];

const userIdValidation = [
    param('id').isMongoId().withMessage('Invalid User ID')
];

// --- Helper: Multer Error Handler ---

const handleUpload = (req, res, next) => {
    uploadAvatar.single('avatarImage')(req, res, (err) => {
        if (err) {
            if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({ message: 'File too large (Max 5MB)' });
            }
            return res.status(400).json({ message: err.message || 'Upload failed' });
        }
        next();
    });
};

// --- Routes ---

// Current User Profile
router.route('/profile')
    .get(getUserProfile)
    .put(profileUpdateValidation, updateUserProfile)
    .delete(deleteOwnAccount);

// Avatar
router.put('/profile/avatar', handleUpload, updateUserAvatar);

// Interests
router.post('/profile/interests', interestValidation, addUserInterest);
router.put('/profile/interests/:userInterestId', [...interestIdValidation, ...interestValidation], updateUserInterest);
router.delete('/profile/interests/:userInterestId', interestIdValidation, removeUserInterest);

// Discovery
router.get('/search', searchValidation, findUsers);
router.get('/:id', userIdValidation, getUserById);

module.exports = router;