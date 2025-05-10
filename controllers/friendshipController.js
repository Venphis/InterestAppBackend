// controllers/friendshipController.js
const Friendship = require('../models/Friendship');
const User = require('../models/User');
const mongoose = require('mongoose'); // Potrzebne do ObjectId

// Helper function to ensure consistent user ID order (optional but good practice for unique index)
const orderUserIds = (userId1, userId2) => {
    return userId1 < userId2 ? { user1: userId1, user2: userId2 } : { user1: userId2, user2: userId1 };
};

// @desc    Send a friend request
// @route   POST /api/friendships/request
// @access  Private
const sendFriendRequest = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    const recipientId = req.body.recipientId;
    const requesterId = req.user._id;

    if (!recipientId) {
        return res.status(400).json({ message: 'Recipient ID is required' });
    }

     if (recipientId === requesterId.toString()) {
        return res.status(400).json({ message: 'You cannot send a friend request to yourself' });
    }

    try {
        // Sprawdź czy odbiorca istnieje
        const recipientExists = await User.findOne({ _id: recipientId, isDeleted: false, isBanned: false });
        if (!recipientExists) {
            return res.status(404).json({ message: 'Recipient user not found, deleted, or banned' });
        }

        // Sprawdź czy już istnieje znajomość (w dowolnym stanie) między tymi użytkownikami
        // Użyj $or do sprawdzenia obu możliwych kolejności user1/user2
         const existingFriendship = await Friendship.findOne({
           $or: [
             { user1: requesterId, user2: recipientId },
             { user1: recipientId, user2: requesterId }
           ]
         });


        if (existingFriendship) {
            // Można tu dodać bardziej szczegółowe komunikaty w zależności od statusu
             if (existingFriendship.status === 'accepted') {
                return res.status(400).json({ message: 'You are already friends with this user' });
             } else if (existingFriendship.status === 'pending') {
                 // Sprawdź kto wysłał zaproszenie
                 if (existingFriendship.requestedBy.equals(requesterId)) {
                    return res.status(400).json({ message: 'Friend request already sent' });
                 } else {
                     return res.status(400).json({ message: 'This user has already sent you a friend request. Please accept or reject it.' });
                 }
             } else if (existingFriendship.status === 'rejected') {
                 // Można pozwolić na ponowne wysłanie po odrzuceniu, usuwając stary wpis lub aktualizując
                 // Na razie: zabroń
                  return res.status(400).json({ message: 'A previous friend request was rejected. Cannot send again yet.' }); // Dostosuj logikę
             } else if (existingFriendship.status === 'blocked') {
                  return res.status(400).json({ message: 'Cannot send friend request due to a block.' });
             } else {
                  return res.status(400).json({ message: 'A relationship already exists between these users.' });
             }
        }

        // Stwórz nową znajomość w stanie 'pending'
        const newFriendship = await Friendship.create({
            user1: requesterId, // Można użyć orderUserIds jeśli chcesz wymusić kolejność
            user2: recipientId,
            status: 'pending',
            requestedBy: requesterId,
            // friendshipType zostanie ustawiony przy akceptacji lub można go podać przy zaproszeniu
             friendshipType: req.body.friendshipType || 'friend' // Opcjonalnie: typ z requestu
        });

        // Opcjonalnie: Wyślij powiadomienie do odbiorcy (np. przez Socket.IO)

        res.status(201).json({ message: 'Friend request sent successfully', friendship: newFriendship });

    } catch (error) {
        console.error('Send Friend Request Error:', error);
        res.status(500).json({ message: 'Server Error sending friend request' });
    }
};

// @desc    Accept a friend request
// @route   PUT /api/friendships/:friendshipId/accept
// @access  Private
const acceptFriendRequest = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    const { friendshipId } = req.params;
    const userId = req.user._id; // Użytkownik akceptujący
     const { friendshipType } = req.body; // Opcjonalnie: Pozwól ustawić typ przy akceptacji

    try {
        const friendship = await Friendship.findById(friendshipId);

        if (!friendship) {
            return res.status(404).json({ message: 'Friendship request not found' });
        }

        // Sprawdź czy użytkownik jest odbiorcą zaproszenia i status to 'pending'
        // Użytkownik akceptujący MUSI być jednym z user1/user2 ORAZ NIE może być requestedBy
        if (friendship.status !== 'pending' || friendship.requestedBy.equals(userId) || !(friendship.user1.equals(userId) || friendship.user2.equals(userId))) {
             return res.status(400).json({ message: 'Cannot accept this request. It might be already accepted, rejected, or you are not the recipient.' });
        }

        // Zmień status na 'accepted'
        friendship.status = 'accepted';
         // Ustaw/zaktualizuj typ znajomości, jeśli podano w body
        if (friendshipType && Friendship.schema.path('friendshipType').enumValues.includes(friendshipType)) {
            friendship.friendshipType = friendshipType;
        } else if (!friendship.friendshipType) { // Ustaw domyślny jeśli nie ma typu
             friendship.friendshipType = 'friend';
        }
        // friendship.actionUserId = userId; // Opcjonalnie: zapisz kto zaakceptował

        const updatedFriendship = await friendship.save();

        // Opcjonalnie: Wyślij powiadomienie do nadawcy zaproszenia

         // Zwróć zaktualizowaną znajomość z populacją danych użytkowników
        const populatedFriendship = await Friendship.findById(updatedFriendship._id)
            .populate('user1', 'username profile')
            .populate('user2', 'username profile');


        res.status(200).json({ message: 'Friend request accepted', friendship: populatedFriendship });

    } catch (error) {
        console.error('Accept Friend Request Error:', error);
         if (error.name === 'ValidationError') { // Błąd walidacji np. złego typu znajomości
             const messages = Object.values(error.errors).map(val => val.message);
             return res.status(400).json({ message: messages.join(', ') });
         }
        res.status(500).json({ message: 'Server Error accepting friend request' });
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
const getFriendships = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    const userId = req.user._id;
    const { status } = req.query; // Filtruj po statusie (np. 'accepted', 'pending')

    let query = {
        $or: [{ user1: userId }, { user2: userId }], // Znajdź znajomości gdzie użytkownik jest user1 LUB user2
    };

    // Dodaj filtrowanie po statusie, jeśli podano
    if (status && ['pending', 'accepted', 'rejected', 'blocked'].includes(status)) {
        query.status = status;
    } else if (status) {
         return res.status(400).json({ message: 'Invalid status filter value' });
    }

    try {
        const friendships = await Friendship.find(query)
            // --- ZMIANA w populate ---
            // Populacja musi być ostrożna. Jeśli user1 lub user2 jest 'isDeleted', Mongoose zwróci null dla tego pola.
            // Można albo filtrować takie znajomości po stronie serwera, albo obsłużyć null na frontendzie.
            .populate({ path: 'user1', select: 'username profile isDeleted', match: { isDeleted: false } })
            .populate({ path: 'user2', select: 'username profile isDeleted', match: { isDeleted: false } })
            .populate('requestedBy', 'username')
            .sort({ createdAt: -1 });

         // Przetwórz wyniki, aby zwrócić dane "drugiego" użytkownika i status z perspektywy zalogowanego
         const processedFriendships = friendships.filter(f => f.user1 && f.user2).map(f => {
            // Znajdź dane "tego drugiego"
            const otherUser = f.user1._id.equals(userId) ? f.user2 : f.user1;
            return {
                friendshipId: f._id,
                user: otherUser, // Dane drugiego użytkownika
                status: f.status,
                friendshipType: f.friendshipType,
                // Dodaj informację, czy zalogowany użytkownik jest odbiorcą oczekującego zaproszenia
                isPendingRecipient: f.status === 'pending' && !f.requestedBy._id.equals(userId),
                requestedByUsername: f.requestedBy.username, // Kto wysłał zaproszenie
                createdAt: f.createdAt,
                updatedAt: f.updatedAt,
            };
        });

        res.json(processedFriendships);

    } catch (error) {
        console.error('Get Friendships Error:', error);
        res.status(500).json({ message: 'Server Error fetching friendships' });
    }
};


module.exports = {
    sendFriendRequest,
    acceptFriendRequest,
    rejectFriendRequest,
    removeFriendship,
    getFriendships
};