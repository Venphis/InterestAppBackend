// routes/userRoutes.js
const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const {
    getUserProfile,
    updateUserProfile,
    findUsers,
    getAllInterests,    // Dodane
    addUserInterest,    // Dodane
    updateUserInterest, // Dodane
    removeUserInterest  // Dodane
} = require('../controllers/userController');
const router = express.Router();

// Route publiczny (lub chroniony, wg uznania) do pobierania listy zainteresowań
router.get('/interests', getAllInterests); // Przeniesione z userController

// Wszystkie route'y poniżej wymagają bycia zalogowanym
router.use(protect);

// Profile routes
router.route('/profile')
  .get(getUserProfile)
  .put(updateUserProfile);

// User interests routes (nested under profile)
router.route('/profile/interests')
    .post(addUserInterest); // Dodaj zainteresowanie do profilu

router.route('/profile/interests/:userInterestId')
    .put(updateUserInterest)   // Aktualizuj opis zainteresowania
    .delete(removeUserInterest); // Usuń zainteresowanie z profilu

// Search route
router.get('/search', findUsers); // np. /api/users/search?q=rob

// Usunięto: /friends/add i /friends

module.exports = router;