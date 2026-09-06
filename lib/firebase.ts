import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User as FirebaseUser,
  Auth 
} from "firebase/auth";
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  serverTimestamp,
  Firestore 
} from "firebase/firestore";

// Firebase configuration using Next.js public environment variables
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || "",
};

// Lazy / Client-only singleton getters to prevent unwanted initialization during static builds
let appInstance: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let dbInstance: Firestore | null = null;
let googleProviderInstance: GoogleAuthProvider | null = null;

export const getFirebaseApp = (): FirebaseApp | null => {
  if (typeof window === "undefined") return null;
  if (!appInstance) {
    if (getApps().length > 0) {
      appInstance = getApp();
    } else if (firebaseConfig.apiKey) {
      appInstance = initializeApp(firebaseConfig);
    }
  }
  return appInstance;
};

export const getFirebaseAuth = (): Auth | null => {
  if (typeof window === "undefined") return null;
  const app = getFirebaseApp();
  if (!app) return null;
  if (!authInstance) {
    authInstance = getAuth(app);
  }
  return authInstance;
};

export const getFirebaseDb = (): Firestore | null => {
  if (typeof window === "undefined") return null;
  const app = getFirebaseApp();
  if (!app) return null;
  if (!dbInstance) {
    dbInstance = getFirestore(app);
  }
  return dbInstance;
};

export const getGoogleProvider = (): GoogleAuthProvider | null => {
  if (typeof window === "undefined") return null;
  if (!googleProviderInstance) {
    googleProviderInstance = new GoogleAuthProvider();
    googleProviderInstance.setCustomParameters({
      prompt: "select_account",
    });
  }
  return googleProviderInstance;
};

/**
 * Signs in user using Firebase Google Auth Popup
 */
export const signInWithGooglePopup = async () => {
  try {
    const auth = getFirebaseAuth();
    const googleProvider = getGoogleProvider();

    if (!auth || !googleProvider) {
      return {
        success: false,
        error: "Firebase authentication is not available in server environment.",
      };
    }

    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;
    
    // Store user login credentials and profile in Firestore
    await saveUserToFirestore(user);
    
    return {
      success: true,
      user,
      idToken: await user.getIdToken(),
    };
  } catch (error: any) {
    console.error("Firebase Google Sign-In Error:", error);
    return {
      success: false,
      error: error.message || "Failed to sign in with Google",
    };
  }
};

/**
 * Saves or updates user credentials and profile in Firestore database
 */
export const saveUserToFirestore = async (user: FirebaseUser) => {
  try {
    const db = getFirebaseDb();
    if (!db) return;

    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);

    const userData = {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName || user.email?.split("@")[0] || "User",
      photoURL: user.photoURL || null,
      providerId: user.providerData[0]?.providerId || "google.com",
      lastLoginAt: serverTimestamp(),
    };

    if (!userSnap.exists()) {
      // New user registration in Firestore
      await setDoc(userRef, {
        ...userData,
        createdAt: serverTimestamp(),
      });
    } else {
      // Existing user update
      await setDoc(userRef, userData, { merge: true });
    }
  } catch (err) {
    console.warn("Could not save user to Firestore (check Firestore rules/config):", err);
  }
};

/**
 * Signs out from Firebase
 */
export const logoutFromFirebase = async () => {
  try {
    const auth = getFirebaseAuth();
    if (auth) {
      await firebaseSignOut(auth);
    }
  } catch (err) {
    console.error("Error signing out from Firebase:", err);
  }
};

/**
 * Subscribes to Firebase Auth state changes
 */
export const subscribeToAuthState = (callback: (user: FirebaseUser | null) => void) => {
  const auth = getFirebaseAuth();
  if (!auth) return () => {};
  return onAuthStateChanged(auth, callback);
};
