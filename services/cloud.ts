import { collection, doc, getDocs, setDoc } from "firebase/firestore";
import { db } from "../firebaseConfig";

export const saveOrderToCloud = async (order) => {
  try {
    await setDoc(doc(db, "orders", order.id), order);
  } catch (err) {
    console.log("Cloud save error:", err);
  }
};

export const loadAllOrdersFromCloud = async () => {
  try {
    const snap = await getDocs(collection(db, "orders"));
    return snap.docs.map((d) => d.data());
  } catch (err) {
    console.log("Load cloud error:", err);
    return [];
  }
};

export const saveClientToCloud = async (client) => {
  try {
    await setDoc(doc(db, "clients", client.mobile), client);
  } catch (err) {
    console.log("Client cloud save error:", err);
  }
};

export const loadAllClientsFromCloud = async () => {
  try {
    const snap = await getDocs(collection(db, "clients"));
    return snap.docs.map((d) => d.data());
  } catch (err) {
    console.log("Load client cloud error:", err);
    return [];
  }
};
