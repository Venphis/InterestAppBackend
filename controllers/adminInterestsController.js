const Interest = require('../models/Interest');
const InterestCategory = require('../models/InterestCategory');
const { validationResult } = require('express-validator');
const logAuditEvent = require('../utils/auditLogger');
const { DEFAULT_LANG } = require('../config/i18n');

// Helper to normalize language codes
const normalizeLang = (lang) => String(lang || '').trim().toLowerCase();

// --- CATEGORY MANAGEMENT ---

const createInterestCategory = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { name, description } = req.body;

    try {
        const categoryExists = await InterestCategory.findOne({ name: { $regex: `^${name}$`, $options: 'i' } });
        if (categoryExists) {
            return res.status(400).json({ message: 'Category with this name already exists' });
        }

        const category = await InterestCategory.create({ name, description });

        await logAuditEvent('admin_created_interest_category', { type: 'admin', id: req.adminUser._id }, 'admin_action', { type: 'interest_category', id: category._id }, { categoryName: name }, req);
        
        res.status(201).json(category);
    } catch (error) {
        console.error('Create Category Error:', error.message);
        next(error);
    }
};

const getAllInterestCategories = async (req, res, next) => {
    try {
        const categories = await InterestCategory.find().sort('name');
        res.json(categories);
    } catch (error) {
        console.error('Get Categories Error:', error.message);
        next(error);
    }
};

const updateInterestCategory = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { name, description } = req.body;

    try {
        const category = await InterestCategory.findById(req.params.categoryId);
        if (!category) return res.status(404).json({ message: 'Category not found' });

        const oldName = category.name;

        if (name) {
            const duplicate = await InterestCategory.findOne({ 
                name: { $regex: `^${name}$`, $options: 'i' }, 
                _id: { $ne: req.params.categoryId } 
            });
            if (duplicate) return res.status(400).json({ message: 'Name already taken' });
            category.name = name;
        }

        if (description !== undefined) category.description = description;

        const updated = await category.save();

        await logAuditEvent('admin_updated_interest_category', { type: 'admin', id: req.adminUser._id }, 'admin_action', { type: 'interest_category', id: updated._id }, { oldName, newName: updated.name }, req);
        
        res.json(updated);
    } catch (error) {
        console.error('Update Category Error:', error.message);
        next(error);
    }
};

const deleteInterestCategory = async (req, res, next) => {
    try {
        const category = await InterestCategory.findById(req.params.categoryId);
        if (!category) return res.status(404).json({ message: 'Category not found' });

        const activeInterests = await Interest.countDocuments({ category: req.params.categoryId, isArchived: false });
        if (activeInterests > 0) {
            return res.status(400).json({ message: `Cannot delete: category has ${activeInterests} active interests` });
        }

        // Unlink interests from this category
        await Interest.updateMany({ category: req.params.categoryId }, { $unset: { category: "" } });
        
        await InterestCategory.deleteOne({ _id: req.params.categoryId });

        await logAuditEvent('admin_deleted_interest_category', { type: 'admin', id: req.adminUser._id }, 'admin_action', { type: 'interest_category', id: req.params.categoryId }, { categoryName: category.name }, req);
        
        res.json({ message: 'Category deleted, interests unassigned' });
    } catch (error) {
        console.error('Delete Category Error:', error.message);
        next(error);
    }
};

// --- TRANSLATIONS (I18N) ---

const upsertInterestCategoryTranslation = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { categoryId, lang } = req.params;
    const language = normalizeLang(lang);
    const { name, description } = req.body;

    try {
        const category = await InterestCategory.findById(categoryId);
        if (!category) return res.status(404).json({ message: 'Category not found' });

        if (language === DEFAULT_LANG) {
            if (name) category.name = name;
            if (description !== undefined) category.description = description;
        } else {
            if (!name) return res.status(400).json({ message: 'Translation name is required' });
            
            const current = category.i18n.get(language) || {};
            category.i18n.set(language, {
                name: name ?? current.name,
                description: description ?? current.description ?? '',
            });
        }

        const updated = await category.save();

        await logAuditEvent('admin_upserted_category_translation', { type: 'admin', id: req.adminUser._id }, 'admin_action', { type: 'interest_category', id: updated._id }, { language }, req);

        res.json(updated);
    } catch (error) {
        console.error('Upsert Category Translation Error:', error.message);
        next(error);
    }
};

const upsertInterestTranslation = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { interestId, lang } = req.params;
    const language = normalizeLang(lang);
    const { name, description } = req.body;

    try {
        const interest = await Interest.findById(interestId);
        if (!interest) return res.status(404).json({ message: 'Interest not found' });

        if (language === DEFAULT_LANG) {
            if (name) interest.name = name;
            if (description !== undefined) interest.description = description;
        } else {
            if (!name) return res.status(400).json({ message: 'Translation name is required' });

            const current = interest.i18n.get(language) || {};
            interest.i18n.set(language, {
                name: name ?? current.name,
                description: description ?? current.description ?? '',
            });
        }

        const updated = await interest.save();

        await logAuditEvent('admin_upserted_interest_translation', { type: 'admin', id: req.adminUser._id }, 'admin_action', { type: 'interest', id: updated._id }, { language }, req);

        const populated = await Interest.findById(updated._id).populate('category', 'name i18n');
        res.json(populated);
    } catch (error) {
        console.error('Upsert Interest Translation Error:', error.message);
        next(error);
    }
};

// --- INTEREST MANAGEMENT ---

const createInterest = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { name, categoryId, description } = req.body;

    try {
        if (categoryId) {
            const catExists = await InterestCategory.findById(categoryId);
            if (!catExists) return res.status(404).json({ message: 'Category not found' });
        }

        const duplicate = await Interest.findOne({
            name: { $regex: `^${name}$`, $options: 'i' },
            category: categoryId,
            isArchived: { $ne: true }
        });

        if (duplicate) return res.status(400).json({ message: 'Active interest already exists' });

        const interest = await Interest.create({
            name,
            category: categoryId || null,
            description,
            isArchived: false
        });

        await logAuditEvent('admin_created_interest', { type: 'admin', id: req.adminUser._id }, 'admin_action', { type: 'interest', id: interest._id }, { name, categoryId }, req);
        
        const populated = await Interest.findById(interest._id).populate('category', 'name');
        res.status(201).json(populated);
    } catch (error) {
        console.error('Create Interest Error:', error.message);
        if (error.code === 11000) return res.status(400).json({ message: 'Duplicate interest' });
        next(error);
    }
};

const getAllInterestsAdmin = async (req, res, next) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const { categoryId, name, showArchived } = req.query;
    const query = {};

    if (categoryId) query.category = categoryId;
    if (name) query.name = { $regex: name, $options: 'i' };
    if (showArchived !== 'true') query.isArchived = false;

    try {
        const [interests, total] = await Promise.all([
            Interest.find(query).populate('category', 'name').sort({ isArchived: 1, name: 1 }).skip(skip).limit(limit),
            Interest.countDocuments(query)
        ]);

        res.json({ 
            interests, 
            currentPage: page, 
            totalPages: Math.ceil(total / limit), 
            totalInterests: total 
        });
    } catch (error) {
        console.error('Get All Interests Error:', error.message);
        next(error);
    }
};

const getInterestByIdAdmin = async (req, res, next) => {
    try {
        const interest = await Interest.findById(req.params.interestId)
            .populate('category', 'name description i18n')
            .exec();

        if (!interest) return res.status(404).json({ message: 'Interest not found' });

        res.json(interest);
    } catch (error) {
        console.error('Get Interest By ID Error:', error.message);
        next(error);
    }
};

const updateInterest = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { name, categoryId, description, isArchived } = req.body;

    try {
        const interest = await Interest.findById(req.params.interestId);
        if (!interest) return res.status(404).json({ message: 'Interest not found' });

        const oldData = { ...interest.toObject() };

        // Handle category update
        if (categoryId === null || categoryId === '') {
            interest.category = null;
        } else if (categoryId) {
            const catExists = await InterestCategory.findById(categoryId);
            if (!catExists) return res.status(404).json({ message: 'Category not found' });
            interest.category = categoryId;
        }

        // Handle name uniqueness check
        if (name) {
            const checkCategory = categoryId !== undefined ? (categoryId || null) : interest.category;
            const duplicate = await Interest.findOne({ 
                name: { $regex: `^${name}$`, $options: 'i' }, 
                category: checkCategory, 
                _id: { $ne: req.params.interestId }, 
                isArchived: false 
            });
            if (duplicate) return res.status(400).json({ message: 'Name already taken in this category' });
            interest.name = name;
        }

        if (description !== undefined) interest.description = description;
        if (isArchived !== undefined) interest.isArchived = isArchived;

        const updated = await interest.save();

        await logAuditEvent('admin_updated_interest', { type: 'admin', id: req.adminUser._id }, 'admin_action', { type: 'interest', id: updated._id }, { oldData, newData: req.body }, req);

        const populated = await Interest.findById(updated._id).populate('category', 'name');
        res.json(populated);
    } catch (error) {
        console.error('Update Interest Error:', error.message);
        if (error.code === 11000) return res.status(400).json({ message: 'Duplicate interest' });
        next(error);
    }
};

const archiveInterest = async (req, res, next) => {
    try {
        const interest = await Interest.findById(req.params.interestId);
        if (!interest) return res.status(404).json({ message: 'Interest not found' });
        if (interest.isArchived) return res.status(400).json({ message: 'Already archived' });

        interest.isArchived = true;
        await interest.save({ validateBeforeSave: false });

        await logAuditEvent('admin_archived_interest', { type: 'admin', id: req.adminUser._id }, 'admin_action', { type: 'interest', id: interest._id }, { name: interest.name }, req);
        
        const populated = await Interest.findById(interest._id).populate('category', 'name');
        res.status(200).json({ message: 'Interest archived', interest: populated });
    } catch (error) {
        console.error('Archive Interest Error:', error.message);
        next(error);
    }
};

const restoreInterest = async (req, res, next) => {
    try {
        const interest = await Interest.findById(req.params.interestId);
        if (!interest) return res.status(404).json({ message: 'Interest not found' });
        if (!interest.isArchived) return res.status(400).json({ message: 'Not archived' });

        const duplicate = await Interest.findOne({ name: interest.name, category: interest.category, isArchived: false });
        if (duplicate) return res.status(400).json({ message: 'Active duplicate exists' });

        interest.isArchived = false;
        await interest.save();

        await logAuditEvent('admin_restored_interest', { type: 'admin', id: req.adminUser._id }, 'admin_action', { type: 'interest', id: interest._id }, { name: interest.name }, req);
        
        const populated = await Interest.findById(interest._id).populate('category', 'name');
        res.json({ message: 'Interest restored', interest: populated });
    } catch (error) {
        console.error('Restore Interest Error:', error.message);
        next(error);
    }
};

module.exports = {
    createInterestCategory,
    getAllInterestCategories,
    updateInterestCategory,
    deleteInterestCategory,
    upsertInterestCategoryTranslation,
    upsertInterestTranslation,
    createInterest,
    getAllInterestsAdmin,
    getInterestByIdAdmin,
    updateInterest,
    archiveInterest,
    restoreInterest  
};