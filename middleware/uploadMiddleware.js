const multer = require('multer');
const path = require('path');
const fs = require('fs');

const ensureUploadsDirExists = (dirPath) => {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
};

const avatarUploadPath = path.join(__dirname, '..', 'public', 'uploads', 'avatars');
ensureUploadsDirExists(avatarUploadPath);

const avatarStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, avatarUploadPath);
    },
    filename: function (req, file, cb) {
        if (!req.user || !req.user._id) {
            return cb(new Error('User not authenticated for upload'));
        }
        const uniqueSuffix = req.user._id + '-' + Date.now() + path.extname(file.originalname);
        cb(null, uniqueSuffix);
    }
});

const avatarFileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        const error = new Error('Not an image! Please upload only images.');
        error.code = 'INVALID_FILE_TYPE';
        cb(error, false);
    }
};

const uploadAvatar = multer({
    storage: avatarStorage,
    limits: {
        fileSize: 1024 * 1024 * 5 
    },
    fileFilter: avatarFileFilter
});

module.exports = { uploadAvatar };