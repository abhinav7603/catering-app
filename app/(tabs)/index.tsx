// ─────────────────────────────────────────────────────────────
// app/(tabs)/index.tsx — CLEAN REBUILT VERSION
// ─────────────────────────────────────────────────────────────

import React, { useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system/legacy";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import { Alert } from "react-native";

import {
  KeyboardAvoidingView,
  Linking,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";

import {
  saveOrderToCloud,
  loadOrdersFromCloud,
  deleteOrderFromCloud,
} from "../../services/cloud";

import { getNextQuotationNumber } from "../../services/cloud";

import {
  Button,
  Card,
  Divider,
  IconButton,
  Snackbar,
  Text,
  TextInput,
} from "react-native-paper";

import DateTimePicker from "@react-native-community/datetimepicker";

import bbnLogo from "../../assets/bbn_logo.png";


// ─── QUOTATION CHANGE SIGNATURE ─────────────────────────────

const getFormSignature = (
  clientName: string,
  mobile: string,
  address: string,
  quotationAmount: string,
  orderBlocks: any[]
) => {
  return JSON.stringify({
    clientName: clientName.trim(),
    mobile: mobile.trim(),
    address: address.trim(),
    quotationAmount: quotationAmount.trim(),
    orderBlocks: orderBlocks.map(b => ({
      description: b.description.trim(),
      notes: b.notes.trim(),
      guests: b.guests.trim(),
      date: b.date instanceof Date ? b.date.toISOString() : b.date,
      time: b.time instanceof Date ? b.time.toISOString() : b.time,
    })),
  });
};

// ─── HINDI ONLINE TRANSLATION API (GOOGLE-LIKE) ─────────────────────────────

// Detect if text already contains Hindi
const isHindi = (text: string) => /[\u0900-\u097F]/.test(text);

// GOOGLE TRANSLITERATION API (NO MEANING CHANGE)
// PERFECT WORKING TRANSLITERATION

async function transliterateWord(word) {
  try {
    const url =
      "https://inputtools.google.com/request?text=" +
      encodeURIComponent(word) +
      "&itc=hi-t-i0-und&num=5";

    const response = await fetch(url);
    const json = await response.json();

    const suggestion = json?.[1]?.[0]?.[1]?.[0];
    return suggestion || word;
  } catch (e) {
    return word;
  }
}

async function transliterateLine(line) {
  const words = line.trim().split(/\s+/);
  let out = [];

  for (const w of words) {
    out.push(await transliterateWord(w));
  }

  return out.join(" ");
}

// ─── WORKSHOP SAFE TRANSLITERATION ─────────────────────────────

const UNITS = [
  "kg", "kgs", "gm", "g", "mg",
  "ltr", "l", "ml",
  "pcs", "pc", "piece", "pieces",
  "plate", "plates"
];

function isNumberOrUnit(word: string) {
  if (/^[0-9./]+$/.test(word)) return true;
  if (UNITS.includes(word.toLowerCase().replace(/[^a-z]/g, ""))) return true;
  return false;
}

async function smartTransliterateLine(line: string) {
  const words = line.trim().split(/\s+/);
  let out: string[] = [];

  for (const w of words) {
    if (isNumberOrUnit(w)) {
      out.push(w);
    } else {
      out.push(await transliterateWord(w));
    }
  }

  return out.join(" ");
}

// ─── TYPES ─────────────────────────────────────────────

type Client = {
  mobile: string;
  name: string;
  address: string;
  notes: string;
};

type OrderBlock = {
  id: string;
  description: string;
  notes: string;
  guests: string;
  date: Date;
  time: Date;
};

function mergeOrders(localOrders: any[], cloudOrders: any[]) {
  const map = new Map();

  // local pehle
  localOrders.forEach((o) => {
    map.set(o.id, o);
  });

  // cloud overwrite karega
  cloudOrders.forEach((o) => {
    map.set(o.id, o);
  });

  // latest first (dateTime ke basis pe)
  return Array.from(map.values()).sort(
    (a, b) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime()
  );
}

const shareFinalPdf = async (finalUri: string) => {
  if (!finalUri.startsWith("file://")) {
  throw new Error("Not a file URI");
}
  try {
    const info = await FileSystem.getInfoAsync(finalUri);
    if (!info.exists) {
      Alert.alert("PDF not found");
      return;
    }

    if (!(await Sharing.isAvailableAsync())) {
      Alert.alert("Sharing not available");
      return;
    }

    // ✅ expo-sharing ONLY supports file://
    await Sharing.shareAsync(finalUri, {
      mimeType: "application/pdf",
      dialogTitle: "Share Quotation PDF",
      UTI: "com.adobe.pdf",
    });

  } catch (e: any) {
    console.log("❌ SHARE ERROR:", e);
    Alert.alert("Share failed", e?.message || "Unknown error");
  }
};

// ─── COMPONENT ─────────────────────────────────────────────

export default function OrderFormScreen() {
  const [orderId, setOrderId] = useState<string>("");
  const [clientName, setClientName] = useState<string>("");
  const [mobile, setMobile] = useState<string>("");
  const [address, setAddress] = useState<string>("");
  const pdfLock = useRef(false);
  const [pdfBusy, setPdfBusy] = useState(false); // ✅ ADD THIS

  const [lastSignature, setLastSignature] = useState<string | null>(null);
const [lockedQuotationId, setLockedQuotationId] = useState<string | null>(null);

  const [activeDateBlock, setActiveDateBlock] = useState<string | null>(null);
  const [activeTimeBlock, setActiveTimeBlock] = useState<string | null>(null);

  const [orderBlocks, setOrderBlocks] = useState<OrderBlock[]>([
    {
      id: "1",
      description: "",
      notes: "",
      guests: "",
      date: new Date(),
      time: new Date(),
    },
  ]);

  const [quotationAmount, setQuotationAmount] = useState<string>("");

  const [snackbarVisible, setSnackbarVisible] = useState<boolean>(false);
  const [snackbarMessage, setSnackbarMessage] = useState<string>("");

  const [clientSuggestions, setClientSuggestions] = useState<Client[]>([]);
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false);
  const [searchField, setSearchField] = useState<"name" | "mobile">("name");

  const scrollRef = useRef<ScrollView>(null);
  const BBN_DIR = `${FileSystem.documentDirectory}BBN_Quotations/`;


  useEffect(() => {
  (async () => {
    try {
      // 1️⃣ local
      const localRaw = await AsyncStorage.getItem("orders");
      const localOrders = localRaw ? JSON.parse(localRaw) : [];

      // 2️⃣ cloud
      const cloudOrders = await loadOrdersFromCloud();

      // 3️⃣ merge (NO DUPLICATES)
      const finalOrders = mergeOrders(localOrders, cloudOrders);

      // 4️⃣ overwrite local cache
      await AsyncStorage.setItem("orders", JSON.stringify(finalOrders));

      console.log("✅ Orders synced from cloud:", finalOrders.length);
    } catch (e) {
      console.log("❌ Sync error:", e);
    }
  })();
}, []);

useEffect(() => {
  if (!clientName) {
    setOrderId("");
    return;
  }

  // 🔒 if quotation already locked, DO NOT reset
  if (lockedQuotationId) return;

  setOrderId("PREVIEW");
}, [clientName, orderBlocks, lockedQuotationId]);

  // ─── HELPERS ─────────────────────────────────────────────

  const ensureFolder = async () => {
    const info = await FileSystem.getInfoAsync(BBN_DIR);
    if (!info.exists)
      await FileSystem.makeDirectoryAsync(BBN_DIR, { intermediates: true });
  };

  const loadClients = async (): Promise<Client[]> => {
    try {
      const stored = await AsyncStorage.getItem("clients");
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  };

  const saveClient = async () => {
    if (!mobile || !clientName) return;

    const clients = await loadClients();
    const existing = clients.find((c) => c.mobile === mobile);

    const newClient: Client = {
      mobile,
      name: clientName,
      address,
      notes: orderBlocks[0]?.notes || "",
    };

    if (!existing) clients.push(newClient);
    else Object.assign(existing, newClient);

    await AsyncStorage.setItem("clients", JSON.stringify(clients));
  };

  const deleteOrder = async (orderId: string) => {
  try {
    await deleteOrderFromCloud(orderId);

    const raw = await AsyncStorage.getItem("orders");
    const orders = raw ? JSON.parse(raw) : [];

    const updatedOrders = orders.filter(
      (o: any) => o.id !== orderId
    );

    await AsyncStorage.setItem(
      "orders",
      JSON.stringify(updatedOrders)
    );

    console.log("🗑️ ORDER DELETED:", orderId);
  } catch (e) {
    console.log("❌ DELETE ERROR:", e);
  }
};

  

  // ─── SUGGESTIONS ─────────────────────────────────────────────

  useEffect(() => {
    const query = searchField === "name" ? clientName : mobile;

    if (query.length >= 2) {
      (async () => {
        const clients = await loadClients();
        const matches = clients.filter(
          (c) =>
            c.name.toLowerCase().includes(query.toLowerCase()) ||
            c.mobile.includes(query)
        );
        setClientSuggestions(matches.slice(0, 5));
        setShowSuggestions(matches.length > 0);
      })();
    } else {
      setShowSuggestions(false);
    }
  }, [clientName, mobile, searchField]);

  const selectClient = (c: Client) => {
    setClientName(c.name);
    setMobile(c.mobile);
    setAddress(c.address);
    setShowSuggestions(false);
  };

  // ─── EVENT BLOCKS ─────────────────────────────────────────────

  const addOrderBlock = () => {
    setOrderBlocks((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        description: "",
        notes: "",
        guests: "",
        date: new Date(),
        time: new Date(),
      },
    ]);
  };

  const updateBlock = (id: string, field: keyof OrderBlock, value: any) => {
    setOrderBlocks((prev) =>
      prev.map((b) => (b.id === id ? { ...b, [field]: value } : b))
    );
  };

  const removeBlock = (id: string) => {
    if (orderBlocks.length > 1)
      setOrderBlocks((prev) => prev.filter((b) => b.id !== id));
  };

  // ─── PDF CREATION ─────────────────────────────────────────────

  const generateAndSavePDF = async (quotationNo: number) => {
    const now = new Date();

const dd = String(now.getDate()).padStart(2, "0");
const mm = String(now.getMonth() + 1).padStart(2, "0");
const yy = String(now.getFullYear()).slice(-2);

const dateStamp = `${dd}${mm}${yy}`;

    const quotationId = `${clientName
  .toUpperCase()
  .replace(/\s+/g, "")
  .replace(/[^A-Z0-9]/g, "")
}${dateStamp}Q${String(quotationNo).padStart(3, "0")}`;

setOrderId(quotationId); // 🔥 IMPORTANT

if (!quotationId) {
  setSnackbarMessage("Quotation ID not ready");
  setSnackbarVisible(true);
  return null;
}

    if (!clientName || !mobile || !address || !quotationAmount) {
  setSnackbarMessage("Fill all required fields.");
  setSnackbarVisible(true);
  return null;
}


    const filteredBlocks = orderBlocks.filter((b) => {
      const noMenu = !b.description.trim();
      const noGuests = !b.guests.trim();
      return !(noMenu && noGuests);
    });

    const menuHTMLArray = await Promise.all(
      filteredBlocks.map(async (b, i) => {
        const date =
          b.date instanceof Date ? b.date.toLocaleDateString("en-GB") : b.date;

        const time =
          b.time instanceof Date
            ? b.time.toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit",
                hour12: true,
              })
            : b.time;

        const engLines = (b.description || "")
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean);

        let hindiLines: string[] = [];
        for (let line of engLines) {
          const clean = line.trim();
          if (!clean) continue;

          let out = clean;

// Only transliterate if it contains Hindi letters
if (isHindi(clean)) {
  out = await transliterateLine(clean);
}

hindiLines.push(out);

        }

        const menuHindi = hindiLines.join("\n");

        // NOTES
        let notesHindi = "";
        if (b.notes) {
          const notesLines = b.notes.split("\n");
          let temp: string[] = [];

          for (let line of notesLines) {
            const clean = line.trim();
            if (!clean) continue;

            let out = clean;

if (isHindi(clean)) {
  out = await transliterateLine(clean);
}

temp.push(out);
          }

          notesHindi = temp.join("\n");
        }

        return `
      <div style="margin-bottom:8px; font-size:14px;">
        <div style="font-weight:700;">EVENT ${i + 1}</div>
        <div style="display:flex; justify-content:space-between; font-size:20px; font-weight:500;">
  <div>DATE: ${date}</div>
  <div>TIME: ${time}</div>
  <div>GUESTS: ${b.guests || "—"}</div>
</div>
        <div style="font-size:20px; margin-bottom:6px;">
  <strong>MENU</strong><br/>
  <span style="font-size:20px;">
    ${menuHindi.replace(/\n/g, "<br/>")}
  </span>
</div>

${
  notesHindi
    ? `
      <div style="font-size:20px; margin-top:6px;">
        <strong>NOTES:</strong>
        <span style="font-size:20px; margin-left:4px;">
          ${notesHindi.replace(/\n/g, "<br/>")}
        </span>
      </div>`
    : ""
}
      </div>
    `;
      })
    );

    const menuHTML = menuHTMLArray.join("");

    // 🔥 LOGO — BASE64 (APK SAFE)
const logoAsset = Asset.fromModule(bbnLogo);
await logoAsset.downloadAsync();

if (!logoAsset.localUri) {
  throw new Error("Logo asset not available");
}

const base64Logo = await FileSystem.readAsStringAsync(
  logoAsset.localUri,
  { encoding: FileSystem.EncodingType.Base64 }
);

const logoImgHtml = `
  <img 
    src="data:image/png;base64,${base64Logo}"
    style="width:110px;height:auto;object-fit:contain;" 
  />
`;

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: A4; margin: 20mm 15mm 25mm 15mm; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 18px; color: #222; line-height: 1.6; margin: 0; padding: 0; }
    .hr { border-top: 3px dashed #ff0000; margin: 10px 0; }
    .info strong { display: inline-block; width: 160px; font-weight: 600; }
  </style>
</head>
<body>
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
    <div style="width:110px;"></div>
    <div style="text-align:center;flex:1;">
      <h1 style="
  font-size:46px;
  color:#d40000;
  font-weight:900;
  letter-spacing:3px;
  margin:0;
">
  B.B.N
</h1>
      <p style="margin:6px 0;font-size:20px;font-weight:bold;">CATERERS | SWEETS | NAMKEEN | SNACKS</p>
      <p style="margin:6px 0;font-size:18px;">PURE VEGETARIAN | INDOOR & OUTDOOR CATERING</p>
    </div>
    <div>${logoImgHtml}</div>
  </div>

  <div class="hr"></div>

  <p style="text-align:center;font-size:16px;">
    27, Channamal Park, East Punjabi Bagh, Near Ashoka Park Metro Station, New Delhi-26 <br/>
    Phone: 9250928676 | 9540505607
  </p>

  <div style="margin-top:30px;">
    <div style="display:flex;justify-content:space-between;font-size:19px;margin-bottom:16px;">
      <div><strong>Client Name:</strong> ${clientName}</div>
      <div><strong>Mobile:</strong> ${mobile}</div>
    </div>
    <div class="info"><strong>Event Location:</strong> ${address}</div>
  </div>

  <div style="margin-top:30px;">
    ${menuHTML}
  </div>

  <div style="margin-top:40px;font-size:19px;">
    <p>For the menu provided by you,<br/>
    We'll be glad to cater you for <strong>Rs. ${parseFloat(
      quotationAmount
    ).toLocaleString("en-IN")} (includes all hidden costs)</strong></p>
  </div>

  <div style="margin-top:30px;font-size:19px;">
    <p>Thank you</p>
    <p>Regards,<br/><strong>B.B.N CATERERS</strong></p>
  </div>

  <div style="text-align:center;font-style:italic;font-size:15px;color:#555;margin-top:40px;">
    <p>WE LOOK FORWARD TO SERVE YOU FOR MANY MORE YEARS TO COME ...</p>
  </div>
</body>
</html>
`;

    await ensureFolder();

let tempUri: string;

try {
  console.log("🧪 PRINT START");
  const res = await Print.printToFileAsync({ html });
  tempUri = res.uri;
  console.log("🧪 PRINT END:", tempUri);
} catch (err) {
  console.log("❌ PRINT FAILED (APK):", err);
  throw err; // THIS is important
}

const finalUri = `${BBN_DIR}${quotationId}.pdf`;
await FileSystem.moveAsync({
  from: tempUri,
  to: finalUri,
});

const dateTime =
  `${now.toLocaleDateString("en-GB")} at ` +
  `${now
    .toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    })
    .replace(/\u202F/g, " ")
    .replace(/\u00A0/g, " ")}`;

    const order = {
  id: quotationId,   // ⭐ GLOBAL + CLIENT FORMAT
  clientName,
  mobile,
  address,
  dateTime,
  orderBlocks,
  quotationAmount,
  pdfPath: finalUri, 
};
    
try {
  await saveOrderToCloud(order);

  const stored = await AsyncStorage.getItem("orders");
  const list = stored ? JSON.parse(stored) : [];
  list.push(order);
  await AsyncStorage.setItem("orders", JSON.stringify(list));

  await saveClient();
} catch (e) {
  console.log("❌ Cloud save failed, quotation NOT finalized", e);
  setSnackbarMessage("Internet issue. Quotation not saved.");
  setSnackbarVisible(true);
  return null;
}

const debug = await AsyncStorage.getItem("orders");
console.log("ORDERS IN STORAGE = ", debug);

    return {
  pdfPath: finalUri,
  quotationId,
};

  };

  const sendMessageOnly = async () => {
    if (!mobile) {
      setSnackbarMessage("Enter mobile number");
      setSnackbarVisible(true);
      return;
    }

    const url = `whatsapp://send?phone=91${mobile}&text=${encodeURIComponent(
      "Please review the menu and let us know if any further arrangements need to be done."
    )}`;

    if (await Linking.canOpenURL(url)) await Linking.openURL(url);
  };

  const sendPDFOnly = async () => {
  if (pdfLock.current || pdfBusy) return;

  pdfLock.current = true;
  setPdfBusy(true);

  try {
    const currentSignature = getFormSignature(
      clientName,
      mobile,
      address,
      quotationAmount,
      orderBlocks
    );

    // 🔁 SAME DATA → SAME PDF (NO NEW Q)
    if (lastSignature === currentSignature && lockedQuotationId) {
      const existingPdfPath = `${BBN_DIR}${lockedQuotationId}.pdf`;

      await shareFinalPdf(existingPdfPath);
      return;
    }

    // 🆕 DATA CHANGED → NEW Q NUMBER
    const quotationNo = await getNextQuotationNumber();

    const result = await generateAndSavePDF(quotationNo);
    if (!result) throw new Error("PDF generation failed");

    const { pdfPath, quotationId } = result;

    // 🔒 LOCK THIS VERSION
    setLastSignature(currentSignature);
    setLockedQuotationId(quotationId);
    setOrderId(quotationId);

    await shareFinalPdf(pdfPath);

  } catch (e) {
    console.log("❌ PDF ERROR:", e);
    setSnackbarMessage("PDF generation failed");
    setSnackbarVisible(true);
  } finally {
    pdfLock.current = false;
    setPdfBusy(false);
  }
};

  // ─── WORKSHOP PRINT (unchanged, formatted only) ─────────────────────────────

  const generateWorkshopText = async (widthChars = 32) => {
    const wrap = (s: string) => {
      const words = s.split(/\s+/);
      const lines: string[] = [];
      let cur = "";
      for (const w of words) {
        if ((cur + " " + w).trim().length > widthChars) {
          if (cur) lines.push(cur.trim());
          cur = w;
        } else {
          cur = (cur + " " + w).trim();
        }
      }
      if (cur) lines.push(cur.trim());
      return lines.join("\n");
    };

    const leftLabel = `CLIENT: ${clientName || "—"}`;
    const rightLabel = `MOB: ${mobile || "—"}`;
    const combined = (leftLabel + " " + rightLabel).slice(0, widthChars);

    const location = `LOCATION: ${address || "—"}`;

    let eventsText = "";

    for (let b of orderBlocks) {
      if (!b.description?.trim() && !b.guests?.trim()) continue;

      const date = b.date.toLocaleDateString("en-GB");
      const time = b.time.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });

      const header = wrap(`DATE: ${date} TIME: ${time} GUESTS: ${b.guests || "—"}`);

      const engLines = (b.description || "").split("\n");
      let hindiLines: string[] = [];

      for (let line of engLines) {
        const clean = line.trim();
        if (!clean) continue;
        hindiLines.push(await smartTransliterateLine(clean));
      }

      const menuHindi = hindiLines.join("\n");

      const menuWrapped = menuHindi.split("\n").map(wrap).join("\n");

      let notesWrapped = "";
      if (b.notes) {
        let notesHindi = "";
        if (b.notes) {
          const ln = b.notes.split("\n");
          let temp: string[] = [];

          for (let line of ln) {
            const clean = line.trim();
            if (!clean) continue;

            temp.push(await smartTransliterateLine(clean));
          }

          notesHindi = temp.join("\n");
        }

        notesWrapped = `\nNOTES:\n${wrap(notesHindi)}`;
      }

      eventsText += `EVENT\n${header}\nMENU:\n${menuWrapped}${notesWrapped}\n\n`;
    }

    return `${combined}\n${wrap(location)}\n\n${eventsText}`;
  };

  const generateWorkshopPDF = async () => {
    const filteredBlocks = orderBlocks.filter((b) => {
      const noMenu = !b.description?.trim();
      const noGuests = !b.guests?.trim();
      return !(noMenu && noGuests);
    });

    let menuHTML = "";

    for (let i = 0; i < filteredBlocks.length; i++) {
      const b = filteredBlocks[i];

      const date =
        b.date instanceof Date ? b.date.toLocaleDateString("en-GB") : b.date;

      const time =
        b.time instanceof Date
          ? b.time.toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
              hour12: true,
            })
          : b.time;

      // MENU LINE-BY-LINE TRANSLATION
      const engLines = (b.description || "").split("\n");

      let hindiLines: string[] = [];
      for (let line of engLines) {
        const clean = line.trim();
        if (!clean) continue;

        const translated = await smartTransliterateLine(clean);
hindiLines.push(translated);

      }

      const menuHindi = hindiLines.join("\n");

      // NOTES LINE-BY-LINE TRANSLATION
      let notesHindi = "";
      if (b.notes) {
        const notesLines = b.notes.split("\n");
        let temp: string[] = [];

        for (let line of notesLines) {
          const clean = line.trim();
          if (!clean) continue;

          const tr = await smartTransliterateLine(clean);
temp.push(tr);
        }

        notesHindi = temp.join("\n");
      }

      // BUILD HTML BLOCK
      menuHTML += `
 <div class="datetime-row">
  <div class="datetime-text datetime-left">
    DATE: ${date}
  </div>

  <div class="datetime-text datetime-right">
    TIME: ${time}
  </div>
</div>

<div class="row">
  <div>
    GUESTS:
    <span class="bold">${b.guests || "—"}</span>
  </div>

  <div class="bold">
    Q. NO.: ${orderId.match(/Q(\d+)$/)?.[1] || ""}
  </div>
</div>


  <div class="menu-title">MENU</div>

<div class="menu-text">
  ${menuHindi.replace(/\n/g, "<br/>")}
</div>

  ${
  notesHindi
    ? `
      <div class="notes-line">
        <span class="notes-title-inline">NOTES:</span>
        <span class="notes-text-inline">
          ${notesHindi.replace(/\n/g, "<br/>")}
        </span>
      </div>
      `
    : ""
}

  <hr />
`;
    }

    const html = `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <style>
@page {
  size: auto;
  margin: 0;
}

body {
  font-family: monospace;
  font-size: 45px;
  line-height: 1.35;     /* 🔽 tighter */
  font-weight: 700;
  margin: 0;
  padding: 0;
}

.header {
  text-align: center;
  font-size: 52px;          /* ⬆️ was 32 */
  font-weight: 900;
}

.subheader {
  text-align: center;
  font-size: 45px;          /* ⬆️ was 28 */
  font-weight: 900;
}

.row {
  display: flex;
  justify-content: space-between;
  margin-top: 8px;
}

.bold {
  font-weight: 900;
}

.menu-title {
  font-size: 52px;          /* ⬆️ was 32 */
  font-weight: 900;
  margin-top: 12px;
}

.menu-text {
  font-size: 48px;          /* ⬆️ was 30 */
  font-weight: 900;
  margin-top: 6px;
  line-height: 1.25;
}

.notes-title {
  font-size: 48px;          /* ⬆️ was 30 */
  font-weight: 900;
  margin-top: 12px;
}

.notes-text {
  font-size: 45px;          /* ⬆️ was 28 */
  font-weight: 800;
  margin-top: 6px;
}

hr {
  border: none;
  border-top: 3px dashed #000;
  margin: 6px 0;   /* 🔥 receipt style */
}


/* 🔒 DATE–TIME NEVER WRAP (4-inch safe) */
.datetime-row {
  display: flex;
  justify-content: space-between;
  white-space: nowrap;
  width: 100%;
}

.datetime-text {
  font-size: 38px;        /* 🔥 still big, but safe */
  font-weight: 900;
  width: 50%;             /* 🔒 fixed width */
  white-space: nowrap;    /* ❌ wrap band */
}

.datetime-left {
  text-align: left;
}

.datetime-right {
  text-align: right;
}

/* 🔒 RECEIPT MODE — STOP EXTRA PAGE */
* {
  page-break-after: auto;
  page-break-before: auto;
  page-break-inside: avoid;
}

.notes-line {
  margin-top: 6px;
}

.notes-title-inline {
  font-size: 48px;
  font-weight: 900;
}

.notes-text-inline {
  font-size: 40px;
  font-weight: 800;
  margin-left: 8px;
  line-height: 1.25;
}

</style>

  </head>

    <div class="header">${clientName}</div>
  <div class="subheader">${mobile}</div>
  <div class="subheader">${address}</div>

  <hr />

    ${menuHTML}
  </body>
</html>
`;

    await ensureFolder();
    const { uri } = await Print.printToFileAsync({ html });
    const finalUri = `${BBN_DIR}${orderId}_workshop.pdf`;

    await FileSystem.moveAsync({
  from: uri,
  to: finalUri,
});
    return finalUri;
  };

  const WorkshopPrint = async () => {
    const widthChars = 32;

    const text = await generateWorkshopText(widthChars);

    try {
      const pdfPath = await generateWorkshopPDF();
      await Sharing.shareAsync(pdfPath, { mimeType: "application/pdf" });
    } catch (err) {
      const txtPath = `${BBN_DIR}${orderId}_workshop.txt`;
      await ensureFolder();
      await FileSystem.writeAsStringAsync(txtPath, text, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      await Sharing.shareAsync(txtPath);
    }
  };

  // ─── UI ─────────────────────────────────────────────

  return (
    <KeyboardAvoidingView style={{ flex: 1 }}>
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 120 }}>
        <Text variant="headlineSmall" style={styles.header}>
          Client Details
        </Text>

        <TextInput label="Quotation ID" value={orderId} disabled style={styles.input} />

        {/* CLIENT NAME */}
        <View style={{ position: "relative" }}>
          <TextInput
            label="Client Name"
            value={clientName}
            onChangeText={setClientName}
            onFocus={() => setSearchField("name")}
            style={styles.input}
          />

          {showSuggestions && searchField === "name" && (
            <View style={styles.suggestionBox}>
              {clientSuggestions.map((c) => (
                <TouchableOpacity
                  key={c.mobile}
                  onPress={() => selectClient(c)}
                  style={styles.suggestionItem}
                >
                  <Text>{c.name}</Text>
                  <Text style={{ color: "#777" }}>{c.mobile}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* MOBILE */}
        <View style={{ position: "relative" }}>
          <TextInput
            label="Mobile Number"
            value={mobile}
            onChangeText={setMobile}
            keyboardType="phone-pad"
            onFocus={() => setSearchField("mobile")}
            style={styles.input}
          />

          {showSuggestions && searchField === "mobile" && (
            <View style={styles.suggestionBox}>
              {clientSuggestions.map((c) => (
                <TouchableOpacity
                  key={c.mobile}
                  onPress={() => selectClient(c)}
                  style={styles.suggestionItem}
                >
                  <Text>{c.name}</Text>
                  <Text style={{ color: "#777" }}>{c.mobile}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        <TextInput label="Event Location" value={address} onChangeText={setAddress} style={styles.input} multiline />

        <Divider style={styles.divider} />

        <Text variant="headlineSmall" style={styles.header}>
          Event Details
        </Text>

        {orderBlocks.map((block, index) => (
          <Card key={block.id} style={styles.card}>
            {/* DATE */}
            <Button mode="outlined" style={{ marginBottom: 10 }} onPress={() => setActiveDateBlock(block.id)}>
              Event Date: {block.date.toLocaleDateString("en-GB")}
            </Button>

            {activeDateBlock === block.id && (
              <DateTimePicker
                value={block.date}
                mode="date"
                onChange={(_, selected) => {
                  setActiveDateBlock(null);
                  if (selected) updateBlock(block.id, "date", selected);
                }}
              />
            )}

            {/* TIME */}
            <Button mode="outlined" style={{ marginBottom: 10 }} onPress={() => setActiveTimeBlock(block.id)}>
              Event Time:{" "}
              {block.time.toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit",
                hour12: true,
              })}
            </Button>

            {activeTimeBlock === block.id && (
              <DateTimePicker
                value={block.time}
                mode="time"
                onChange={(_, selected) => {
                  setActiveTimeBlock(null);
                  if (selected) updateBlock(block.id, "time", selected);
                }}
              />
            )}

            <TextInput
              label={`Menu Description ${index + 1}`}
              value={block.description}
              onChangeText={(t) => updateBlock(block.id, "description", t)}
              style={[styles.input, { minHeight: 140, textAlignVertical: "top", paddingTop: 12 }]}
              multiline
            />

            <TextInput label="Guests" value={block.guests} keyboardType="numeric" style={styles.input} onChangeText={(t) => updateBlock(block.id, "guests", t)} />

            <TextInput label="Notes" value={block.notes} multiline style={styles.input} onChangeText={(t) => updateBlock(block.id, "notes", t)} />

            {orderBlocks.length > 1 && <IconButton icon="delete" onPress={() => removeBlock(block.id)} />}
          </Card>
        ))}

        <Button icon="plus" mode="outlined" style={styles.input} onPress={addOrderBlock}>
          Add Another Event
        </Button>

        <Divider style={styles.divider} />

        <Text variant="headlineSmall" style={styles.header}>
          Summary
        </Text>

        <TextInput label="Quotation Amount (Rs.)" keyboardType="numeric" value={quotationAmount} onChangeText={setQuotationAmount} style={styles.input} />

        <View style={styles.row}>
          <Button mode="contained" style={[styles.btn, { backgroundColor: "#25D366" }]} onPress={sendMessageOnly}>
            Send Message
          </Button>

          <Button
  mode="contained"
  disabled={pdfBusy}
  style={[
  styles.btn,
  { backgroundColor: pdfBusy ? "#999" : "#007BFF" }
]}
 
  onPress={sendPDFOnly}
>
  Send PDF
</Button>

          <Button mode="contained" style={[styles.btn, { backgroundColor: "#333" }]} onPress={WorkshopPrint}>
            Workshop Print
          </Button>
        </View>

        <Snackbar visible={snackbarVisible} onDismiss={() => setSnackbarVisible(false)}>
          {snackbarMessage}
        </Snackbar>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── STYLES ─────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { padding: 16, backgroundColor: "#F8F9FA" },
  header: { marginVertical: 12, fontWeight: "600" },
  input: { marginBottom: 12, backgroundColor: "#FFF" },
  divider: { marginVertical: 16 },
  card: { padding: 12, marginBottom: 16 },
  row: { flexDirection: "row", justifyContent: "space-between" },
  btn: { flex: 1, marginHorizontal: 4 },
  suggestionBox: {
    position: "absolute",
    backgroundColor: "#FFF",
    elevation: 5,
    zIndex: 20,
    top: 70,
    left: 0,
    right: 0,
  },
  suggestionItem: {
    padding: 10,
    borderBottomWidth: 1,
    borderColor: "#EEE",
  },
  
});
