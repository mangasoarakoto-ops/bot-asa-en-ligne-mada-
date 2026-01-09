// firebase.js
const { initializeApp } = require("firebase/app");
// --- ZAVA-DEHIBE: Nampiana 'deleteDoc', 'query', ary 'where' teto ---
const { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  updateDoc, 
  collection, 
  addDoc, 
  getDocs, 
  deleteDoc, // Nampiana
  query,     // Nampiana (Ity ilay nitady hiteraka olana)
  where      // Nampiana
} = require("firebase/firestore");

// Configuration (Efa nampidirinao)
const firebaseConfig = {
  apiKey: "AIzaSyDPrTWmxovZdbbi0BmXr6Tn6AyrlaO0cbM",
  authDomain: "bot-asa-en-ligne-mada.firebaseapp.com",
  databaseURL: "https://bot-asa-en-ligne-mada-default-rtdb.firebaseio.com",
  projectId: "bot-asa-en-ligne-mada",
  storageBucket: "bot-asa-en-ligne-mada.firebasestorage.app",
  messagingSenderId: "837671675184",
  appId: "1:837671675184:web:2cd55ef7eacac7e33554f5",
  measurementId: "G-72CKQLX75V"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// --- EXPORT (Avoaka daholo izay ilaina rehetra) ---
module.exports = { 
  db, 
  doc, 
  setDoc, 
  getDoc, 
  updateDoc, 
  collection, 
  addDoc, 
  getDocs, 
  deleteDoc, // Avoaka eto koa
  query,     // Avoaka eto
  where      // Avoaka eto
};
