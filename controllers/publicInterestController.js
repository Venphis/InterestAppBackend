// controllers/publicInterestController.js
const Interest = require('../models/Interest');
const InterestCategory = require('../models/InterestCategory');

const getPublicInterestCategories = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    try {
        // Można dodać filtrowanie kategorii, jeśli np. admin może je ukrywać
        const categories = await InterestCategory.find().sort('name');
        res.json(categories);
    } catch (error) {
        console.error('Public Get Categories Error:', error);
        res.status(500).json({ message: 'Server Error fetching categories.' });
    }
};

const getPublicInterests = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    const { categoryId, name } = req.query;
    const query = { isArchived: false }; // TYLKO AKTYWNE
    if (categoryId) query.category = categoryId;
    if (name) query.name = { $regex: name, $options: 'i' };

    try {
        const interests = await Interest.find(query)
                                       .populate('category', 'name')
                                       .sort('name');
        res.json(interests);
    } catch (error) {
        console.error('Public Get Interests Error:', error);
        res.status(500).json({ message: 'Server Error fetching interests.' });
    }
};
module.exports = { getPublicInterestCategories, getPublicInterests };