import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";

// The "Piano Trainer" web app in the mario-luevanos project. These values
// identify the project; they are not secrets (access is enforced by
// firestore.rules).
const app = initializeApp({
  apiKey: "AIzaSyAMH0_12KphsfUpiK54rQLoaYNHWr4C914",
  authDomain: "mario-luevanos.firebaseapp.com",
  projectId: "mario-luevanos",
  storageBucket: "mario-luevanos.appspot.com",
  messagingSenderId: "346048406019",
  appId: "1:346048406019:web:457c3fa8d9a746ece56436",
});

/** Firestore with an IndexedDB cache, so songs opened once also work offline. */
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
});

export const auth = getAuth(app);
