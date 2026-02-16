// firebase.js

// Import Firebase SDK from CDN
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signOut } from 'firebase/auth';
import { getFirestore, collection, getDocs, addDoc, deleteDoc, doc, updateDoc, query, where, setDoc } from 'firebase/firestore';

// Firebase configuration using environment variables
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize services
const auth = getAuth(app);
const db = getFirestore(app);

// Export all necessary functions
export { 
    auth, 
    db, 
    onAuthStateChanged, 
    signOut, 
    collection, 
    getDocs, 
    addDoc, 
    deleteDoc, 
    doc, 
    updateDoc, 
    query, 
  where,
  setDoc
};
