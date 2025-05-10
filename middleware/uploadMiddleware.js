// middleware/uploadMiddleware.js
const multer = require('multer');
const path = require('path');
const fs = require('fs'); // Do tworzenia folderów

// Upewnij się, że folder docelowy istnieje
const ensureUploadsDirExists = (dirPath) => {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
};

const avatarUploadPath = path.join(__dirname, '..', 'public', 'uploads', 'avatars');
ensureUploadsDirExists(avatarUploadPath);

// Konfiguracja przechowywania dla avatarów
const avatarStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, avatarUploadPath); // Folder docelowy
    },
    filename: function (req, file, cb) {
        // Unikalna nazwa pliku: userId-timestamp.rozszerzenie
        const uniqueSuffix = req.user._id + '-' + Date.now() + path.extname(file.originalname);
        cb(null, uniqueSuffix);
    }
});

// Filtr plików (akceptuj tylko obrazy)
const avatarFileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('Not an image! Please upload only images.'), false);
    }
};

const uploadAvatar = multer({
    storage: avatarStorage,
    limits: {
        fileSize: 1024 * 1024 * 2 // Limit 2MB
    },
    fileFilter: avatarFileFilter
});

module.exports = { uploadAvatar };