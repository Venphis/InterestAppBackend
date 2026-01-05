const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Define storage path for avatars
const avatarUploadPath = path.join(__dirname, '..', 'public', 'uploads', 'avatars');

// Ensure upload directory exists at startup to prevent ENOENT errors
if (!fs.existsSync(avatarUploadPath)) {
    fs.mkdirSync(avatarUploadPath, { recursive: true });
}

// Configure disk storage with custom naming convention
const avatarStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, avatarUploadPath);
    },
    filename: (req, file, cb) => {
        // Dependency: Auth middleware must run before upload to provide req.user
        if (!req.user || !req.user._id) {
            return cb(new Error('User not authenticated for upload'));
        }
        
        // Format: userId-timestamp.ext
        const uniqueSuffix = `${req.user._id}-${Date.now()}${path.extname(file.originalname)}`;
        cb(null, uniqueSuffix);
    }
});

// Validate file type (Images only)
const avatarFileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        const error = new Error('Invalid file type. Only images are allowed.');
        error.code = 'INVALID_FILE_TYPE';
        cb(error, false);
    }
};

// Initialize Multer with 5MB limit
const uploadAvatar = multer({
    storage: avatarStorage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: avatarFileFilter
});

module.exports = { uploadAvatar };