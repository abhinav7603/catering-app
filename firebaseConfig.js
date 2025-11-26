import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCrdYbGfyBo0uoI4B4gPfEy8MZNdlYkvkc",
  authDomain: "bbn-catering-app.firebaseapp.com",
  projectId: "bbn-catering-app",
  storageBucket: "bbn-catering-app.appspot.com",
  messagingSenderId: "649478189134",
  appId: "1:649478189134:web:491f2e97ac22704eeed31f"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
