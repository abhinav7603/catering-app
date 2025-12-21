// firebaseConfig.ts
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyC0SJryERQgFG_LCmHrZimEkTdRpsPAC-g",
  authDomain: "bbn-caterers.firebaseapp.com",
  projectId: "bbn-caterers",
  storageBucket: "bbn-caterers.firebasestorage.app",
  messagingSenderId: "209245951082",
  appId: "1:209245951082:web:bb0ee038e769697e1fe613"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
