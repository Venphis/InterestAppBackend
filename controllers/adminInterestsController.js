// controllers/adminInterestsController.js
const Interest = require('../models/Interest');
const InterestCategory = require('../models/InterestCategory');
const UserInterest = require('../models/UserInterest'); // Potrzebne do sprawdzenia powiązań

// createInterestCategory - bez zmian
// getAllInterestCategories - bez zmian
// updateInterestCategory - bez zmian
// deleteInterestCategory - bez zmian (ale pamiętaj o TODO co do zainteresowań w usuwanej kategorii)

const createInterestCategory = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    const { name, description } = req.body;
    if (!name) {
        return res.status(400).json({ message: 'Category name is required.' });
    }
    try {
        const categoryExists = await InterestCategory.findOne({ name });
        if (categoryExists) {
            return res.status(400).json({ message: 'Interest category with this name already exists.' });
        }
        const category = await InterestCategory.create({ name, description });
        res.status(201).json(category);
    } catch (error) {
        console.error('Admin Create Interest Category Error:', error);
        if (error.name === 'ValidationError') return res.status(400).json({ message: error.message });
        res.status(500).json({ message: 'Server Error creating interest category.' });
    }
};

const getAllInterestCategories = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    try {
        const categories = await InterestCategory.find().sort('name');
        res.json(categories);
    } catch (error) {
        console.error('Admin Get All Interest Categories Error:', error);
        res.status(500).json({ message: 'Server Error fetching interest categories.' });
    }
};

const updateInterestCategory = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    const { name, description } = req.body;
    try {
        const category = await InterestCategory.findById(req.params.categoryId);
        if (!category) {
            return res.status(404).json({ message: 'Interest category not found.' });
        }
        if (name) {
            const existingCategory = await InterestCategory.findOne({ name, _id: { $ne: req.params.categoryId } });
            if (existingCategory) {
                return res.status(400).json({ message: 'Another category with this name already exists.' });
            }
            category.name = name;
        }
        if (description !== undefined) category.description = description;

        const updatedCategory = await category.save();
        res.json(updatedCategory);
    } catch (error) {
        console.error('Admin Update Interest Category Error:', error);
        if (error.name === 'ValidationError') return res.status(400).json({ message: error.message });
        res.status(500).json({ message: 'Server Error updating interest category.' });
    }
};

const deleteInterestCategory = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    try {
        const category = await InterestCategory.findById(req.params.categoryId);
        if (!category) {
            return res.status(404).json({ message: 'Interest category not found.' });
        }
        // Zmiana: Zamiast usuwać kategorię z zainteresowań, można je zarchiwizować lub zabronić
        const interestsInCategory = await Interest.countDocuments({ category: req.params.categoryId, isArchived: false });
        if (interestsInCategory > 0) {
            return res.status(400).json({ message: `Cannot delete category. It still contains ${interestsInCategory} active interest(s). Please archive or reassign them first.`});
        }
        await InterestCategory.deleteOne({ _id: req.params.categoryId });
        res.json({ message: 'Interest category deleted successfully.' });
    } catch (error) {
        console.error('Admin Delete Interest Category Error:', error);
        res.status(500).json({ message: 'Server Error deleting interest category.' });
    }
};


// --- Interest Management ---

const createInterest = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    const { name, categoryId, description } = req.body;
    if (!name) {
        return res.status(400).json({ message: 'Interest name is required.' });
    }
    try {
        if (categoryId) {
            const catExists = await InterestCategory.findById(categoryId);
            if (!catExists) return res.status(404).json({ message: 'Specified interest category not found.' });
        }

        // Sprawdź unikalność tylko wśród aktywnych zainteresowań
        const interestExists = await Interest.findOne({ name, category: categoryId || null, isArchived: false });
        if (interestExists) {
            return res.status(400).json({ message: 'Active interest with this name (and category) already exists.' });
        }

        const interest = await Interest.create({
            name,
            category: categoryId || null,
            description,
            isArchived: false // Domyślnie aktywne
        });
        const populatedInterest = await Interest.findById(interest._id).populate('category', 'name');
        res.status(201).json(populatedInterest);
    } catch (error) {
        console.error('Admin Create Interest Error:', error);
        if (error.name === 'ValidationError') return res.status(400).json({ message: error.message });
        if (error.code === 11000) return res.status(400).json({ message: 'An interest with this name (and category) already exists or violates a unique index.' });
        res.status(500).json({ message: 'Server Error creating interest.' });
    }
};

// @desc    Get all interests (admin view - can see archived)
// @route   GET /api/admin/interests
// @access  Private (Admin/Superadmin/Moderator)
const getAllInterestsAdmin = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const { categoryId, name, showArchived } = req.query;

    const query = {};
    if (categoryId) query.category = categoryId;
    if (name) query.name = { $regex: name, $options: 'i' };
    if (showArchived !== 'true') { // Domyślnie pokazuj tylko aktywne
        query.isArchived = false;
    }
    // Jeśli showArchived === 'true', nie dodajemy warunku isArchived, więc pokaże wszystkie

    try {
        const interests = await Interest.find(query)
                                       .populate('category', 'name')
                                       .sort({ isArchived: 1, name: 1 }) // Najpierw aktywne, potem posortowane po nazwie
                                       .skip(skip)
                                       .limit(limit);
        const totalInterests = await Interest.countDocuments(query);
        res.json({
            interests,
            currentPage: page,
            totalPages: Math.ceil(totalInterests / limit),
            totalInterests
        });
    } catch (error) {
        console.error('Admin Get All Interests Error:', error);
        res.status(500).json({ message: 'Server Error fetching interests.' });
    }
};

const updateInterest = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    const { name, categoryId, description, isArchived } = req.body; // Dodano isArchived
    try {
        const interest = await Interest.findById(req.params.interestId);
        if (!interest) {
            return res.status(404).json({ message: 'Interest not found.' });
        }

        if (categoryId) {
            const catExists = await InterestCategory.findById(categoryId);
            if (!catExists) return res.status(404).json({ message: 'Specified interest category not found.' });
            interest.category = categoryId;
        } else if (categoryId === null || categoryId === '') {
            interest.category = null;
        }

        if (name) {
            const newCategoryForUniqueness = categoryId !== undefined ? categoryId : interest.category;
            const existingInterest = await Interest.findOne({
                name,
                category: newCategoryForUniqueness || null,
                _id: { $ne: req.params.interestId },
                isArchived: false // Unikalność sprawdzaj tylko wśród aktywnych
            });
            if (existingInterest) {
                return res.status(400).json({ message: 'Another active interest with this name (and category) already exists.' });
            }
            interest.name = name;
        }
        if (description !== undefined) interest.description = description;
        if (isArchived !== undefined) interest.isArchived = isArchived; // Pozwól na zmianę statusu archiwizacji

        const updatedInterest = await interest.save();
        const populatedInterest = await Interest.findById(updatedInterest._id).populate('category', 'name');
        res.json(populatedInterest);
    } catch (error) {
        console.error('Admin Update Interest Error:', error);
        if (error.name === 'ValidationError') return res.status(400).json({ message: error.message });
        if (error.code === 11000) return res.status(400).json({ message: 'An interest with this name (and category) already exists or violates a unique index.' });
        res.status(500).json({ message: 'Server Error updating interest.' });
    }
};

// Zmieniono z deleteInterest na archiveInterest
// @desc    Archive an interest (soft delete)
// @route   DELETE /api/admin/interests/:interestId (lub PUT .../archive)
// @access  Private (Admin/Superadmin)
const archiveInterest = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    try {
        const interest = await Interest.findById(req.params.interestId);
        if (!interest) {
            return res.status(404).json({ message: 'Interest not found.' });
        }
        if (interest.isArchived) {
            return res.status(400).json({ message: 'Interest is already archived.' });
        }

        interest.isArchived = true;
        await interest.save();

        await logAuditEvent(
            'admin_archived_interest',
            { type: 'admin', id: req.adminUser._id },
            'admin_action',
            { type: 'interest', id: interest._id },
            { interestName: interest.name }, req
        );

        res.json({ message: 'Interest archived successfully. It will no longer be available for users to add but will remain on existing profiles.' });
    } catch (error) {
        console.error('Admin Archive Interest Error:', error);
        res.status(500).json({ message: 'Server Error archiving interest.' });
    }
};

// @desc    Restore an archived interest
// @route   PUT /api/admin/interests/:interestId/restore
// @access  Private (Admin/Superadmin)
const restoreInterest = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    try {
        const interest = await Interest.findById(req.params.interestId);
        if (!interest) {
            return res.status(404).json({ message: 'Interest not found.' });
        }
        if (!interest.isArchived) {
            return res.status(400).json({ message: 'Interest is not archived.' });
        }

        // Sprawdź, czy nie ma aktywnego zainteresowania o tej samej nazwie i kategorii
        const activeDuplicate = await Interest.findOne({
            name: interest.name,
            category: interest.category,
            isArchived: false
        });
        if (activeDuplicate) {
            return res.status(400).json({ message: 'Cannot restore. An active interest with the same name and category already exists.' });
        }

        interest.isArchived = false;
        await interest.save();
        const populatedInterest = await Interest.findById(interest._id).populate('category', 'name');
        res.json({ message: 'Interest restored successfully.', interest: populatedInterest });
    } catch (error) {
        console.error('Admin Restore Interest Error:', error);
        res.status(500).json({ message: 'Server Error restoring interest.' });
    }
};


module.exports = {
    createInterestCategory,
    getAllInterestCategories,
    updateInterestCategory,
    deleteInterestCategory,
    createInterest,
    getAllInterestsAdmin,
    updateInterest,
    archiveInterest, // Zmieniono
    restoreInterest  // Dodano
};