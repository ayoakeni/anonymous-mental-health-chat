import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
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

export const auth = getAuth(app);
export const db = getFirestore(app);

export const ai = getAI(app, { backend: new GoogleAIBackend() });
