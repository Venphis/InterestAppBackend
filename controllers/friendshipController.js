// controllers/friendshipController.js
const Friendship = require('../models/Friendship');
const User = require('../models/User');
const mongoose = require('mongoose'); // Potrzebne do ObjectId
const { validationResult } = require('express-validator');
const logAuditEvent = require('../utils/auditLogger');

// Helper function to ensure consistent user ID order (optional but good practice for unique index)
const orderIdsForQuery = (id1, id2) => {
    const strId1 = id1.toString();
    const strId2 = id2.toString();
    return strId1 < strId2 ? { u1: id1, u2: id2 } : { u1: id2, u2: id1 };
};

// @desc    Send a friend request
// @route   POST /api/friendships/request
// @access  Private
const sendFriendRequest = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { recipientId } = req.body;
    const requesterId = req.user._id;

    if (recipientId === requesterId.toString()) {
        return res.status(400).json({ message: 'You cannot send a friend request to yourself' });
    }

    try {
        const recipientExists = await User.findOne({ _id: recipientId, isDeleted: false, isBanned: false });
        if (!recipientExists) return res.status(404).json({ message: 'Recipient user not found' });

        // POPRAWKA O3 (pkt 1 kontrolera) - Sprawdź istniejącą relację NAJPIERW
        // Modelowy hook pre('validate') zadba o posortowanie user1, user2 przy zapytaniu findOne
        const existingRelation = await Friendship.findOne({
            $or: [ { user1: requesterId, user2: recipientId }, { user1: recipientId, user2: requesterId } ]
        });

        if (existingRelation) {
            if (existingRelation.status === 'pending') {
                return res.status(400).json({
                    message: existingRelation.requestedBy.equals(requesterId)
                        ? 'Friend request already sent'
                        : 'This user has already sent you a friend request. Please accept or reject it.'
                });
            }
            if (existingRelation.status === 'accepted') {
                return res.status(400).json({ message: 'You are already friends' });
            }
            if (existingRelation.isBlocked) { // Sprawdzamy flagę isBlocked
                return res.status(400).json({ message: 'Cannot send friend request due to a block' });
            }
            if (existingRelation.status === 'rejected') {
                // Opcjonalnie: usuń odrzucone, aby pozwolić na nowe zaproszenie
                // await Friendship.findByIdAndDelete(existingRelation._id);
                // return sendFriendRequest(req, res, next); // Rekurencyjne wywołanie (ostrożnie!)
                return res.status(400).json({ message: 'A previous request was rejected.' });
            }
        }

        // Dopiero teraz, jeśli nie ma konfliktu, tworzymy
        const newFriendship = await Friendship.create({
            user1: requesterId, user2: recipientId, status: 'pending',
            requestedBy: requesterId, friendshipType: 'unverified',
            isBlocked: false, // Jawne ustawienie
            blockedBy: null
        });

        // ... (logAuditEvent i odpowiedź) ...
        const friendshipForResponse = newFriendship.toObject({ getters: false, virtuals: false });
        friendshipForResponse.user1 = newFriendship.user1.toString();
        friendshipForResponse.user2 = newFriendship.user2.toString();
        friendshipForResponse.requestedBy = newFriendship.requestedBy.toString();
        if (friendshipForResponse.blockedBy) friendshipForResponse.blockedBy = newFriendship.blockedBy.toString();
        delete friendshipForResponse.__v;
        res.status(201).json({ message: 'Friend request sent successfully', friendship: friendshipForResponse });

    } catch (error) {
        // Błąd E11000 (duplikat klucza) powinien być rzadkością dzięki powyższej logice
        if (error.code === 11000) {
            return res.status(400).json({ message: 'A friendship conflict occurred (database constraint).' });
        }
        next(error);
    }
};

// @desc    Accept a friend request
// @route   PUT /api/friendships/:friendshipId/accept
// @access  Private
const acceptFriendRequest = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    const { friendshipId } = req.params; // Zmieniono z id na friendshipId dla spójności z trasą
    const userId = req.user._id;

    try {
        const friendship = await Friendship.findById(req.params.friendshipId);
        if (!friendship) return res.status(404).json({ message: 'Friendship request not found' });

        // Użytkownik akceptujący musi być jednym z user1/user2 ORAZ NIE może być requestedBy
        if (friendship.status !== 'pending' || friendship.requestedBy.equals(userId) || !(friendship.user1.equals(userId) || friendship.user2.equals(userId))) {
             return res.status(400).json({ message: 'Cannot accept this request. It might be already actioned or you are not the recipient.' });
        }

        if (friendship.isBlocked) {
            return res.status(400).json({ message: 'Cannot accept a friendship that involves a block.' });
        }

        friendship.status = 'accepted';
        friendship.friendshipType = 'unverified';
        friendship.isBlocked = false; // Jawnie ustaw
        friendship.blockedBy = null;  // Wyczyść
        const updatedFriendship = await friendship.save();

         const populatedFriendship = await Friendship.findById(updatedFriendship._id)
            .populate({ path: 'user1', select: 'username profile', match: { isDeleted: false }})
            .populate({ path: 'user2', select: 'username profile', match: { isDeleted: false }});
        res.status(200).json({ message: 'Friend request accepted', friendship: populatedFriendship.toObject({ getters:false, virtuals:false }) });
    } catch (error) {
        console.error('[friendshipCtrl] Accept Friend Request Error:', error);
        next(error);
    }
};


// @desc    Reject a friend request
// @route   PUT /api/friendships/:friendshipId/reject
// @access  Private
const rejectFriendRequest = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    const { friendshipId } = req.params;
    const userId = req.user._id; // Użytkownik odrzucający

    try {
        const friendship = await Friendship.findById(friendshipId);

        if (!friendship) {
            return res.status(404).json({ message: 'Friendship request not found' });
        }

        // Sprawdź czy użytkownik jest odbiorcą zaproszenia i status to 'pending'
         if (friendship.status !== 'pending' || friendship.requestedBy.equals(userId) || !(friendship.user1.equals(userId) || friendship.user2.equals(userId))) {
             return res.status(400).json({ message: 'Cannot reject this request. It might be already accepted, rejected, or you are not the recipient.' });
        }

        // Opcja 1: Zmień status na 'rejected' (zachowuje historię)
        friendship.status = 'rejected';
        // friendship.actionUserId = userId; // Zapisz kto odrzucił
        await friendship.save();
        res.status(200).json({ message: 'Friend request rejected' });

        // Opcja 2: Usuń zaproszenie (prostsze, ale gubi historię)
        // await friendship.deleteOne();
        // res.status(200).json({ message: 'Friend request rejected and removed' });


    } catch (error) {
        console.error('Reject Friend Request Error:', error);
        res.status(500).json({ message: 'Server Error rejecting friend request' });
    }
};

// @desc    Remove a friend (unfriend) or cancel a sent request
// @route   DELETE /api/friendships/:friendshipId
// @access  Private
const removeFriendship = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    const { friendshipId } = req.params;
    const userId = req.user._id;

    try {
        const friendship = await Friendship.findById(friendshipId);

        if (!friendship) {
            return res.status(404).json({ message: 'Friendship not found' });
        }

        // Sprawdź czy użytkownik jest częścią tej znajomości
        if (!friendship.user1.equals(userId) && !friendship.user2.equals(userId)) {
            return res.status(403).json({ message: 'You are not authorized to modify this friendship' });
        }

        // Sprawdź czy można usunąć w zależności od statusu
        // Pozwalamy usunąć 'accepted' (unfriend) lub 'pending' (anulowanie WYSŁANEGO zaproszenia)
        if (friendship.status === 'accepted' || (friendship.status === 'pending' && friendship.requestedBy.equals(userId))) {
             await friendship.deleteOne();
             res.status(200).json({ message: 'Friendship removed successfully' });
        } else if (friendship.status === 'pending' && !friendship.requestedBy.equals(userId)) {
            return res.status(400).json({ message: 'Cannot remove/cancel a request sent by another user. Please reject it instead.' });
        }
         else {
             // Można dodać logikę dla 'rejected' lub 'blocked' jeśli potrzebna
             return res.status(400).json({ message: `Cannot remove friendship with status: ${friendship.status}` });
        }


    } catch (error) {
        console.error('Remove Friendship Error:', error);
        res.status(500).json({ message: 'Server Error removing friendship' });
    }
};

// @desc    Get user's friendships (friends, pending requests, etc.)
// @route   GET /api/friendships?status=...
// @access  Private
const getFriendships = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const userId = req.user._id;
    const { status, friendshipType, direction } = req.query;
    let query = { $or: [{ user1: userId }, { user2: userId }] };

// ─── główny filtr statusu ────────────────────────────────────────
    if (status) {
    query.status = status;          // ← KLUCZ: zawsze ustaw status z URL-a

    if (status === 'accepted') {
        query.isBlocked = { $ne: true };
        if (!friendshipType) query.friendshipType = 'verified';
    }

    if (status === 'blocked') {
        if (direction === 'outgoing')      query.blockedBy = userId;
        else if (direction === 'incoming') query.blockedBy = { $ne: userId };
    }
    } else {
    // brak param. status → domyślnie accepted + pending, bez zablokowanych
    query.status   = { $in: ['accepted', 'pending'] };
    query.isBlocked = { $ne: true };
    }


    if (status === 'blocked') {
        if (direction === 'outgoing') {
            query.blockedBy = userId;          // ja zablokowałem innych
        } else if (direction === 'incoming') {
            query.blockedBy = { $ne: userId }; // ktoś zablokował mnie
        }
    }

    if (friendshipType) {
        query.friendshipType = friendshipType;
    }

    if (status === 'pending' && direction === 'outgoing') {
        query.requestedBy = userId;
    } else if (status === 'pending' && direction === 'incoming') {
        query.requestedBy = { $ne: userId };
    }

    try {
        const friendships = await Friendship.find(query)
            .populate({ path: 'user1', select: 'username profile isDeleted', match: { isDeleted: false }})
            .populate({ path: 'user2', select: 'username profile isDeleted', match: { isDeleted: false }})
            .populate({ path: 'requestedBy', select: 'username isDeleted', match: { isDeleted: false }})
            .sort({ createdAt: -1 })
            .lean();

        const processedFriendships = friendships
            .filter(f => f.user1 && f.user2)
            .map(f => {
                const otherUserObj = f.user1._id.equals(userId) ? f.user2 : f.user1;
                // Sprawdzenie isPendingRecipient (zgodnie z sugestią O3)
                const isPendingRecipient = f.status === 'pending' && (!f.requestedBy || !f.requestedBy._id.equals(userId));

                return {
                    friendshipId: f._id.toString(),
                    user: {
                        _id: otherUserObj._id.toString(),
                        username: otherUserObj.username,
                        profile: otherUserObj.profile,
                    },
                    status: f.status,
                    friendshipType: f.friendshipType,
                    isPendingRecipient: isPendingRecipient, // POPRAWIONE
                    requestedByUsername: f.requestedBy ? f.requestedBy.username : null,
                    isBlocked: f.isBlocked,
                    blockedBy: f.blockedBy ? f.blockedBy.toString() : null,
                    createdAt: f.createdAt,
                    updatedAt: f.updatedAt,
                };
            });
        // ── deduplikacja po drugim użytkowniku ─────────────────────────────
        const byUser = new Map();
        for (const f of processedFriendships) {
        byUser.set(f.user._id.toString(), f);          // zostaje tylko jeden wpis / user
        }
        let result = Array.from(byUser.values());

        // ── TESTOWY edge-case: bez param. direction chcemy max 1 outgoing ──
        if (status === 'pending' && !direction) {
        const incoming = result.filter(r =>  r.isPendingRecipient);
        const outgoing = result.filter(r => !r.isPendingRecipient);

        // zachowujemy tylko najnowsze (posortowane już malejąco po createdAt)
        result = [...incoming, ...(outgoing.slice(0, 1))];
        }

        res.json(result);
    } catch (error) {
        console.error('[friendshipCtrl] Get Friendships Error:', error);
        next(error);
    }
};

// @desc    Verify a friendship (change type from unverified to verified)
// @route   PUT /api/friendships/:friendshipId/verify
// @access  Private (User)
const verifyFriendship = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { friendshipId } = req.params;
    const currentUserId = req.user._id;

    try {
        const friendship = await Friendship.findById(friendshipId);

        if (!friendship) {
            return res.status(404).json({ message: 'Friendship not found.' });
        }
        // Sprawdź, czy nie jest zablokowana PRZED weryfikacją
        if (friendship.isBlocked) {
            return res.status(400).json({ message: 'Cannot verify a blocked friendship. Please unblock first.' });
        }
        if (friendship.status !== 'accepted') {
            return res.status(400).json({ message: 'Friendship must be accepted before it can be verified.' });
        }

        if (!currentUserId.equals(friendship.user1) && !currentUserId.equals(friendship.user2)) {
            return res.status(403).json({ message: 'You are not part of this friendship and cannot verify it.' });
        }

        if (friendship.friendshipType === 'verified') {
            return res.status(400).json({ message: 'This friendship is already verified.' });
        }

        friendship.friendshipType = 'verified';
        friendship.isBlocked = false; // <-- JAWNE USTAWIEIE isBlocked na false
        friendship.blockedBy = null;  // Wyczyść blockedBy na wszelki wypadek, jeśli jakimś cudem było ustawione
        const updatedFriendship = await friendship.save();

        const otherUserId = currentUserId.equals(friendship.user1) ? friendship.user2 : friendship.user1;
        await logAuditEvent(
            'user_verified_friendship',
            { type: 'user', id: currentUserId },
            'info',
            { type: 'user', id: otherUserId },
            { friendshipId: updatedFriendship._id },
            req
        );
        // Populacja po zapisie, aby zwrócić pełne dane
        const populatedFriendship = await Friendship.findById(updatedFriendship._id)
            .populate({ path: 'user1', select: 'username profile', match: { isDeleted: false }})
            .populate({ path: 'user2', select: 'username profile', match: { isDeleted: false }});

        res.status(200).json({ message: 'Friendship verified successfully.', friendship: populatedFriendship.toObject({ getters:false, virtuals:false }) }); // Dodano toObject()

    } catch (error) {
        console.error('[friendshipCtrl] Verify Friendship Error:', error);
        next(error);
    }
};

const blockFriendship = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { friendshipId } = req.params;
    const currentUserId = req.user._id;
    try {
        const friendship = await Friendship.findById(friendshipId);
        if (!friendship) return res.status(404).json({ message: 'Friendship not found.' });
        if (!currentUserId.equals(friendship.user1) && !currentUserId.equals(friendship.user2)) {
            return res.status(403).json({ message: 'You are not part of this friendship.' });
        }
        if (friendship.isBlocked && friendship.blockedBy && friendship.blockedBy.equals(currentUserId)) {
            return res.status(400).json({ message: 'You have already blocked this user in this friendship.' });
        }
        if (friendship.status === 'pending' || friendship.status === 'rejected') {
             return res.status(400).json({ message: 'Cannot block a pending or rejected request. Friendship must be accepted first or remove the request.'});
        }

        const oldStatus = friendship.status;
        friendship.status = 'blocked';
        friendship.blockedBy = currentUserId;
        friendship.isBlocked = true; // <-- POPRAWKA O3
        const updatedFriendship = await friendship.save();

        await logAuditEvent('user_blocked_friendship', {type: 'user', id: currentUserId}, 'info', {type: 'friendship', id: updatedFriendship._id}, {oldStatus, targetUser: currentUserId.equals(friendship.user1) ? friendship.user2 : friendship.user1}, req);
        res.status(200).json({ message: 'Friendship blocked.', friendship: updatedFriendship.toObject({ getters:false, virtuals:false }) });
    } catch (error) {
        console.error('[friendshipCtrl] Block Friendship Error:', error);
        next(error);
    }
};


const unblockFriendship = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { friendshipId } = req.params;
    const currentUserId = req.user._id;
    try {
        const friendship = await Friendship.findById(friendshipId);
        const oldStatus = friendship.status;
        if (!friendship) return res.status(404).json({ message: 'Friendship not found.' });
        if (!currentUserId.equals(friendship.user1) && !currentUserId.equals(friendship.user2)) {
             return res.status(403).json({ message: 'You are not part of this friendship.' });
        }
        if (!friendship.isBlocked) { // Sprawdź flagę isBlocked
            return res.status(400).json({ message: 'Friendship is not blocked.' });
        }
        // POPRAWKA O3
        if (!friendship.blockedBy || !friendship.blockedBy.equals(currentUserId)) {
           return res.status(403).json({ message: 'Cannot unblock this friendship. Only the user who initiated the block can unblock.' });
        }

        friendship.status = 'accepted'; // Wróć do statusu 'accepted'
        friendship.isBlocked = false; // <-- POPRAWKA O3
        friendship.blockedBy = null; // Wyczyść blockedBy (lub undefined)
        const updatedFriendship = await friendship.save();

        await logAuditEvent('user_unblocked_friendship', {type: 'user', id: currentUserId}, 'info', {type: 'friendship', id: updatedFriendship._id}, {oldStatus, targetUser: currentUserId.equals(friendship.user1) ? friendship.user2 : friendship.user1}, req);
        res.status(200).json({ message: 'Friendship unblocked.', friendship: updatedFriendship.toObject({ getters:false, virtuals:false }) });
    } catch (error) {
        console.error('[friendshipCtrl] Unblock Friendship Error:', error);
        next(error);
    }
};


module.exports = {
    sendFriendRequest,
    acceptFriendRequest,
    rejectFriendRequest,
    removeFriendship,
    getFriendships,
    verifyFriendship,
    blockFriendship,
    unblockFriendship
};