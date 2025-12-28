// services/cloud.js

import {
  collection,
  doc,
  setDoc,
  getDocs,
  deleteDoc,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";

import { db } from "../firebaseConfig";

/* ─────────────────────────────────────────────
   🔥 GLOBAL QUOTATION COUNTER (SINGLE SOURCE)
   - Transaction safe
   - Year reset safe
   - Multi-device safe
───────────────────────────────────────────── */

export async function getNextQuotationNumber() {
  const ref = doc(db, "counters", "quotation");
  const currentYear = new Date().getFullYear();

  const next = await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);

    // First ever quotation
    if (!snap.exists()) {
      transaction.set(ref, {
        year: currentYear,
        counter: 1,
      });
      return 1;
    }

    const data = snap.data();
    let counter = Number(data.counter || 0);

    // New year → reset
    if (data.year !== currentYear) {
      counter = 1;
      transaction.set(
        ref,
        { year: currentYear, counter },
        { merge: true }
      );
      return counter;
    }

    // Normal increment
    counter += 1;
    transaction.update(ref, { counter });
    return counter;
  });

  return Number(next);
}

/* ─────────────────────────────────────────────
   SAVE / UPDATE ORDER TO CLOUD
   - Idempotent (same ID safe)
   - Server timestamp added
───────────────────────────────────────────── */

export async function saveOrderToCloud(order) {
  await setDoc(
    doc(db, "orders", order.id),
    {
      ...order,
      paymentStatus: order.paymentStatus || "UNPAID",
      paidAmount: order.paidAmount || 0,
      pendingAmount: order.pendingAmount || 0,
      createdAt: serverTimestamp(), // 🔒 cloud truth
    },
    { merge: true }
  );

  console.log("✅ SAVED TO CLOUD:", order.id);
}

/* ─────────────────────────────────────────────
   LOAD ORDERS FROM CLOUD
   - Date & Time restore safe
───────────────────────────────────────────── */

export async function loadOrdersFromCloud() {
  const snap = await getDocs(collection(db, "orders"));
  const list = [];

  snap.forEach((docSnap) => {
    const data = docSnap.data();

    data.orderBlocks = (data.orderBlocks || []).map((b) => ({
      ...b,
      date: b.date?.seconds
        ? new Date(b.date.seconds * 1000)
        : b.date,
      time: b.time?.seconds
        ? new Date(b.time.seconds * 1000)
        : b.time,
    }));

    list.push(data);
  });

  return list;
}

/* ─────────────────────────────────────────────
   DELETE ORDER FROM CLOUD
───────────────────────────────────────────── */

export async function deleteOrderFromCloud(orderId) {
  await deleteDoc(doc(db, "orders", orderId));
  console.log("🗑️ DELETED FROM CLOUD:", orderId);
}
