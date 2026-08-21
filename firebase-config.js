import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getAnalytics } from "firebase/analytics";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBkaQyxobwqVIqrI7pFSu2Mi_GZad5jh04",
  authDomain: "studentrm-cfbf3.firebaseapp.com",
  projectId: "studentrm-cfbf3",
  storageBucket: "studentrm-cfbf3.firebasestorage.app",
  messagingSenderId: "775126945845",
  appId: "1:775126945845:web:be3ba478198356e23f217c",
  measurementId: "G-112H6EN9B7"
};

const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth = getAuth(app);
const db = getFirestore(app);

export { auth, db };
