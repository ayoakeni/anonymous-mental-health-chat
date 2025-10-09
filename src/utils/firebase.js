import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, Timestamp } from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { getAI, GoogleAIBackend } from "firebase/ai";

const firebaseConfig = {
  apiKey: "AIzaSyDbms1wjGNePw8V_SP9OJdNm4TBnSbp_YI",
  authDomain: "login-authentication-e4113.firebaseapp.com",
  databaseURL: "https://login-authentication-e4113-default-rtdb.firebaseio.com",
  projectId: "login-authentication-e4113",
  storageBucket: "login-authentication-e4113.appspot.com",
  messagingSenderId: "914208076072",
  appId: "1:914208076072:web:996aeb751f454bbb5da01d"
};

const app = initializeApp(firebaseConfig);
const storage = getStorage(app)
const db = getFirestore(app);
const auth = getAuth(app);

export { db, auth, Timestamp, storage, ref, uploadBytes, getDownloadURL};

export const ai = getAI(app, { backend: new GoogleAIBackend() });
