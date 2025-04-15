// models/Friendship.js
const mongoose = require('mongoose');

const FriendshipSchema = new mongoose.Schema({
  // Uporządkujmy ID, aby uniknąć duplikatów (user1 < user2)
  // Lub zarządzajmy tym w logice kontrolera
  user1: { // ID pierwszego użytkownika
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  user2: { // ID drugiego użytkownika
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: [
        'pending', // Oczekuje na akceptację
        'accepted', // Znajomość zaakceptowana
        'rejected', // Zaproszenie odrzucone
        'blocked' // Jeden użytkownik zablokował drugiego (wymaga dodatkowego pola 'blockedBy')
        ],
    required: true,
    default: 'pending'
  },
  // Kto wysłał zaproszenie - ważne dla statusu 'pending' i 'rejected'
  requestedBy: {
     type: mongoose.Schema.Types.ObjectId,
     ref: 'User',
     required: true
  },
  // Kto odrzucił/zablokował (opcjonalne, dla statusu 'rejected'/'blocked')
  // actionUserId: {
  //    type: mongoose.Schema.Types.ObjectId,
  //    ref: 'User'
  // },
  friendshipType: { // Typ znajomości
    type: String,
    enum: [ // Przykładowe typy - dostosuj do swoich potrzeb
      'unverified',
      'verified'
    ],
    default: 'unverified' // Domyślny typ po akceptacji
  }
}, { timestamps: true });

// Indeks ułatwiający wyszukiwanie znajomości dla danego użytkownika
FriendshipSchema.index({ user1: 1, status: 1 });
FriendshipSchema.index({ user2: 1, status: 1 });
// Unikalny indeks zapobiegający duplikatom tej samej pary (wymaga sortowania ID w kontrolerze)
// FriendshipSchema.index({ user1: 1, user2: 1 }, { unique: true });

module.exports = mongoose.model('Friendship', FriendshipSchema);