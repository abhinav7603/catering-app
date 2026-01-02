import React, { useState } from "react";
import {
  View,
  SectionList,
  StyleSheet,
  TouchableOpacity,
  LayoutAnimation,
  Platform,
  UIManager,
  Alert,
} from "react-native";

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";

import * as Print from "expo-print";

import { Asset } from "expo-asset";
import bbnLogo from "../../assets/bbn_logo.png";

import {
  Card,
  Divider,
  IconButton,
  Text,
} from "react-native-paper";

import { useRef } from "react";

import { useFocusEffect } from "@react-navigation/native";

import {
  loadOrdersFromCloud,
  deleteOrderFromCloud,
} from "../../services/cloud";


// ─── ENABLE ANDROID ANIMATION ───────────────────────────

if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ─── TYPES ─────────────────────────────────────────────

type OrderBlock = {
  description: string;
  notes: string;
  guests?: string;
  date?: string | Date;
  time?: string | Date;
};


type Order = {
  id: string; // NAME + DDMMYY + QXXX
  clientName: string;
  mobile: string;
  address: string;
  dateTime: string;
  orderBlocks: OrderBlock[];
  quotationAmount: string;
  pdfPath: string;   
};

type Section = {
  title: string;
  data: Order[];
};

const BBN_DIR = FileSystem.documentDirectory + "BBN_Quotations/";

// ─── HELPERS ───────────────────────────────────────────
const extractQNumber = (id: string) => {
  const match = id.match(/Q(\d+)$/);
  return match ? match[1] : "";
};

const extractDateTime = (dateTime: string) => {
  if (!dateTime) return { date: "", time: "" };

  // common separators handle
  if (dateTime.includes(" at ")) {
    const [d, t] = dateTime.split(" at ");
    return { date: d.trim(), time: t.trim() };
  }

  if (dateTime.includes(",")) {
    const [d, t] = dateTime.split(",");
    return { date: d.trim(), time: t.trim() };
  }

  const parts = dateTime.split(" ");
  if (parts.length >= 2) {
    return {
      date: parts[0],
      time: parts.slice(1).join(" "),
    };
  }

  return { date: dateTime, time: "" };
};

// ─── WORKSHOP PRINT HELPERS (FROM index.tsx) ───────────

const UNITS = [
  "kg","kgs","gm","g","mg",
  "ltr","l","ml",
  "pcs","pc","piece","pieces",
  "plate","plates"
];

const isNumberOrUnit = (word: string) => {
  if (/^[0-9./]+$/.test(word)) return true;
  if (UNITS.includes(word.toLowerCase().replace(/[^a-z]/g, ""))) return true;
  return false;
};

const transliterateWord = async (word: string) => {
  try {
    const url =
      "https://inputtools.google.com/request?text=" +
      encodeURIComponent(word) +
      "&itc=hi-t-i0-und&num=5";

    const res = await fetch(url);
    const json = await res.json();
    return json?.[1]?.[0]?.[1]?.[0] || word;
  } catch {
    return word;
  }
};

const smartTransliterateLine = async (line: string) => {
  const words = line.trim().split(/\s+/);
  let out: string[] = [];

  for (const w of words) {
    if (isNumberOrUnit(w)) out.push(w);
    else out.push(await transliterateWord(w));
  }

  return out.join(" ");
};


// 🔥 MAIN WORKSHOP PRINT (SAFE)
const workshopPrint = async (item: Order) => {
    // 🔹 EXTRACT DATE & TIME SAFELY (JS SIDE)
  let date = "";
  let time = "";

  if (item.dateTime) {
    if (item.dateTime.includes(" at ")) {
      const parts = item.dateTime.split(" at ");
      date = parts[0];
      time = parts[1];
    } else if (item.dateTime.includes(",")) {
      const parts = item.dateTime.split(",");
      date = parts[0];
      time = parts[1];
    } else {
      const parts = item.dateTime.split(" ");
      date = parts[0];
      time = parts.slice(1).join(" ");
    }
  }

  let menuHTML = "";

  for (let i = 0; i < item.orderBlocks.length; i++) {
    const b = item.orderBlocks[i];

    const guests = b.guests?.trim() || "—";

    const engLines = (b.description || "").split("\n");
    let hindiLines: string[] = [];

    for (let line of engLines) {
      const clean = line.trim();
      if (!clean) continue;
      hindiLines.push(await smartTransliterateLine(clean));
    }

    const menuHindi = hindiLines.join("\n");

    let notesHindi = "";
    if (b.notes) {
      const lines = b.notes.split("\n");
      let tmp: string[] = [];
      for (let l of lines) {
        const clean = l.trim();
        if (!clean) continue;
        tmp.push(await smartTransliterateLine(clean));
      }
      notesHindi = tmp.join("\n");
    }

    menuHTML += `

  <div style="font-weight:900;font-size:48px;margin-top:12px;">
    MENU
  </div>

  <div style="font-size:46px;line-height:1.25;">
    ${menuHindi.replace(/\n/g,"<br/>")}
  </div>

  ${
    notesHindi
      ? `<div style="margin-top:6px;font-size:42px;">
           <b>NOTES:</b> ${notesHindi.replace(/\n/g,"<br/>")}
         </div>`
      : ""
  }

  <hr />
`;
  }

  // ===== LOGO BASE64 (APK + PROD SAFE) =====

  const html = `
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
@page{size:auto;margin:0}
body{font-family:monospace;font-size:45px;font-weight:900;margin:0}
hr{border:none;border-top:3px dashed #000;margin:6px 0}
</style>
</head>
<body>
<div style="text-align:center;font-size:52px;">${item.clientName}</div>
<div style="text-align:center;font-size:45px;">${item.mobile}</div>
<div style="text-align:center;font-size:45px;">${item.address}</div>

<div style="
  display:flex;
  justify-content:space-between;
  font-size:38px;
  font-weight:900;
  margin-top:4px;
">
  <div>DATE: ${date}</div>
  <div>TIME: ${time}</div>
</div>

<div style="
  display:flex;
  justify-content:space-between;
  font-size:38px;
  font-weight:900;
  margin-top:4px;
">
  <div>GUESTS: ${item.orderBlocks[0]?.guests || "—"}</div>
  <div>Q. NO.: ${extractQNumber(item.id)}</div>
</div>

<hr/>

${menuHTML}
</body>
</html>
`;

const { uri } = await Print.printToFileAsync({ html });
// 🔹 CLIENT NAME (no spaces, safe)
const safeClientName = (item.clientName || "Client")
  .replace(/\s+/g, "")
  .replace(/[^a-zA-Z0-9]/g, "");

// 🔹 DATE → DDMMYY
const now = new Date();
const dd = String(now.getDate()).padStart(2, "0");
const mm = String(now.getMonth() + 1).padStart(2, "0");
const yy = String(now.getFullYear()).slice(-2);

// 🔹 Q NUMBER
const qNo = `Q${extractQNumber(item.id).padStart(3, "0")}`;

// 🔹 FINAL FILE NAME
const pdfName = `${safeClientName}${dd}${mm}${yy}${qNo}.pdf`;

await FileSystem.makeDirectoryAsync(BBN_DIR, { intermediates: true });

const newPath = BBN_DIR + pdfName;

// 🔹 RENAME FILE
await FileSystem.moveAsync({
  from: uri,
  to: newPath,
});


if (!(await Sharing.isAvailableAsync())) {
  Alert.alert("Sharing not available");
  return;
}

await Sharing.shareAsync(newPath, {
  mimeType: "application/pdf",
  dialogTitle: "Share Workshop PDF",
  UTI: "com.adobe.pdf",
});

// 🔥 EXTRACT NUMBER FROM "...Q001"
};

const quotationPrint = async (item: Order) => {

  /* -------- MENU HTML (NO TRANSLATION) -------- */
  let menuHTML = "";

  for (let i = 0; i < item.orderBlocks.length; i++) {
    const b = item.orderBlocks[i];

    const safeDate = b.date
  ? new Date(b.date as any)
  : null;

const date = safeDate
  ? safeDate.toLocaleDateString("en-GB")
  : "";

const safeTime = b.time
  ? new Date(b.time as any)
  : null;

const time = safeTime
  ? safeTime.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    })
  : "";

    menuHTML += `
      <div style="margin-bottom:8px;">
        <div style="font-weight:700;">EVENT ${i + 1}</div>

        <div style="display:flex;justify-content:space-between;font-size:20px;">
          <div>DATE: ${date}</div>
          <div>TIME: ${time}</div>
          <div>GUESTS: ${b.guests || "—"}</div>
        </div>

        <div style="margin-top:6px;font-size:20px;">
          <strong>MENU</strong><br/>
          ${b.description?.replace(/\n/g, "<br/>") || ""}
        </div>

        ${
          b.notes
            ? `<div style="margin-top:6px;font-size:20px;">
                 <strong>NOTES:</strong>
                 ${b.notes.replace(/\n/g, "<br/>")}
               </div>`
            : ""
        }

        <hr/>
      </div>
    `;
  }

  // ===== LOGO BASE64 (QUOTATION PDF) =====
const quotationLogoAsset = Asset.fromModule(bbnLogo);
await quotationLogoAsset.downloadAsync();

const quotationBase64Logo = await FileSystem.readAsStringAsync(
  quotationLogoAsset.localUri!,
  { encoding: FileSystem.EncodingType.Base64 }
);

const quotationLogoImgHtml = `
  <img
    src="data:image/png;base64,${quotationBase64Logo}"
    style="width:110px;height:auto;object-fit:contain;"
  />
`;

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <base href="file:///" />
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

    <p style="margin:6px 0;font-size:20px;font-weight:bold;">
      CATERERS | SWEETS | NAMKEEN | SNACKS
    </p>

    <p style="margin:6px 0;font-size:18px;">
      PURE VEGETARIAN | INDOOR & OUTDOOR CATERING
    </p>
  </div>

  <div>
    ${quotationLogoImgHtml}
  </div>
</div>

  </div>

  <div class="hr"></div>

  <p style="text-align:center;font-size:16px;">
    27, Channamal Park, East Punjabi Bagh, Near Ashoka Park Metro Station, New Delhi-26 <br/>
    Phone: 9250928676 | 9540505607
  </p>

  <div style="margin-top:30px;">
  <div style="display:flex;justify-content:space-between;font-size:19px;margin-bottom:16px;">
    <div><strong>Client Name:</strong> ${item.clientName || "Client"}</div>
    <div><strong>Mobile:</strong> ${item.mobile}</div>
  </div>
  <div class="info"><strong>Event Location:</strong> ${item.address}</div>
</div>

  <div style="margin-top:30px;">
    ${menuHTML}
  </div>

  <div style="margin-top:40px;font-size:19px;">
    <p>
  For the menu provided by you,<br/>
  We'll be glad to cater you for
  <strong>
    Rs. ${parseFloat(item.quotationAmount).toLocaleString("en-IN")}
    (includes all hidden costs)
  </strong>
</p>

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

  const { uri } = await Print.printToFileAsync({ html });
 // 🔹 CLIENT NAME (no spaces, safe)
const safeClientName = (item.clientName || "Client")
  .replace(/\s+/g, "")
  .replace(/[^a-zA-Z0-9]/g, "");

// 🔹 DATE → DDMMYY
const now = new Date();
const dd = String(now.getDate()).padStart(2, "0");
const mm = String(now.getMonth() + 1).padStart(2, "0");
const yy = String(now.getFullYear()).slice(-2);

// 🔹 Q NUMBER
const qNo = `Q${extractQNumber(item.id).padStart(3, "0")}`;

// 🔹 FINAL FILE NAME
const pdfName = `${safeClientName}${dd}${mm}${yy}${qNo}.pdf`;

await FileSystem.makeDirectoryAsync(BBN_DIR, { intermediates: true });
const newPath = BBN_DIR + pdfName;

// 🔹 RENAME FILE
await FileSystem.moveAsync({
  from: uri,
  to: newPath,
});


if (!(await Sharing.isAvailableAsync())) {
  Alert.alert("Sharing not available");
  return;
}

await Sharing.shareAsync(newPath, {
  mimeType: "application/pdf",
  dialogTitle: "Share Quotation PDF",
  UTI: "com.adobe.pdf",
});


};

// 🔥 SORT BY QUOTATION NUMBER (DESC)
const sortByQuotationNumber = (orders: Order[]): Order[] => {
  return [...orders].sort(
    (a, b) =>
      Number(extractQNumber(b.id)) -
      Number(extractQNumber(a.id))
  );
};

// ─── SCREEN ────────────────────────────────────────────

export default function HistoryScreen() {
  const [sections, setSections] = useState<Section[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

   const shareLock = useRef(false);

  // 🔄 Reload every time screen opens
  useFocusEffect(
    React.useCallback(() => {
      loadOrders();
    }, [])
  );

  // ─── LOAD ORDERS (LOCAL + CLOUD) ─────────────────────

  const loadOrders = async () => {
    try {
      // 1️⃣ LOCAL
      const localRaw = await AsyncStorage.getItem("orders");
      const localOrders: Order[] = localRaw ? JSON.parse(localRaw) : [];

      const sortedLocal = sortByQuotationNumber(localOrders);

      // show immediately
      setSections([
        { title: "All Quotations", data: sortedLocal },
      ]);

      // 2️⃣ CLOUD
      const cloudOrders: Order[] = await loadOrdersFromCloud();

      if (!cloudOrders || cloudOrders.length === 0) {
        return;
      }

      // 3️⃣ MERGE (cloud overrides)
      const map = new Map<string, Order>();
      localOrders.forEach((o) => map.set(o.id, o));
      cloudOrders.forEach((o) => map.set(o.id, o));

      const merged = sortByQuotationNumber(
        Array.from(map.values())
      );

      // 4️⃣ SAVE + DISPLAY
      await AsyncStorage.setItem("orders", JSON.stringify(merged));

      setSections([
        { title: "All Quotations", data: merged },
      ]);
    } catch (e) {
      console.log("❌ HISTORY LOAD ERROR:", e);
    }
  };

  // ─── EXPAND / COLLAPSE ───────────────────────────────

  const toggleExpand = (id: string) => {
    LayoutAnimation.configureNext(
      LayoutAnimation.Presets.easeInEaseOut
    );
    setExpandedId((prev) => (prev === id ? null : id));
  };

  // ─── DELETE ORDER ────────────────────────────────────

  const deleteOrder = (orderId: string) => {
  Alert.alert(
    "Delete Quotation",
    "This will permanently delete the quotation.",
    [
      { text: "Cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            // 1️⃣ cloud first
            await deleteOrderFromCloud(orderId);

            // 2️⃣ then local
            const raw = await AsyncStorage.getItem("orders");
            const list: Order[] = raw ? JSON.parse(raw) : [];

            const updated = sortByQuotationNumber(
              list.filter(o => o.id !== orderId)
            );

            await AsyncStorage.setItem(
              "orders",
              JSON.stringify(updated)
            );

            setSections([
              { title: "All Quotations", data: updated },
            ]);

          } catch (e) {
            Alert.alert(
              "Delete failed",
              "Cloud delete failed. Check internet."
            );
          }
        },
      },
    ]
  );
};


  // ─── UI ─────────────────────────────────────────────

  return (
    <View style={styles.container}>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 40 }}
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionHeader}>
            {section.title}
          </Text>
        )}
        
        renderItem={({ item }) => {
  const expanded = expandedId === item.id;

  return (
    <View style={{ marginBottom: 10 }}>
      <Card style={styles.card}>
        {/* HEADER */}
        <TouchableOpacity onPress={() => toggleExpand(item.id)}>
          <View style={styles.rowBetween}>
            <View>
              <Text variant="titleMedium">
  {item.clientName || "Unnamed Client"}
</Text>

              <Text style={styles.subText}>
                Quotation ID: {item.id}
              </Text>
            </View>

            <IconButton
              icon={expanded ? "chevron-up" : "chevron-down"}
            />
          </View>
        </TouchableOpacity>

        <Text>{item.mobile}</Text>
        <Text>{item.address}</Text>
        <Text style={styles.subText}>
          {item.dateTime}
        </Text>

        {expanded && (
          <View>
            <Divider style={{ marginVertical: 8 }} />

            {item.orderBlocks.map((b, i) => (
              <View key={`${item.id}-${i}`} style={styles.block}>
                <Text style={styles.blockTitle}>
                  Event {i + 1}
                </Text>
                <Text>{b.description}</Text>
                {b.notes ? (
                  <Text style={styles.notes}>
                    Notes: {b.notes}
                  </Text>
                ) : null}
              </View>
            ))}

            <Divider style={{ marginVertical: 8 }} />

            <View style={styles.rowBetween}>
              <Text variant="titleSmall">
                Amount: ₹{item.quotationAmount}
              </Text>

              <View style={styles.actions}>
  <IconButton
    icon="printer"
    onPress={() => workshopPrint(item)}
  />

  <IconButton
  icon="share-variant"
  onPress={async () => {
  if (shareLock.current) return;
  shareLock.current = true;

  try {
    await Sharing.shareAsync(item.pdfPath, {
  mimeType: "application/pdf",
});
  } finally {
    shareLock.current = false;
  }
}}
/>

  <IconButton
    icon="delete"
    iconColor="red"
    onPress={() => deleteOrder(item.id)}
  />
</View>

            </View>
          </View>
        )}
      </Card>
    </View>
  );
}}

        ListEmptyComponent={
          <Text style={{ textAlign: "center", marginTop: 40 }}>
            No order history found
          </Text>
        }
      />
    </View>
  );
}

// ─── STYLES ───────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 10,
  },
  sectionHeader: {
    fontSize: 16,
    fontWeight: "bold",
    marginVertical: 6,
  },
  card: {
    marginBottom: 10,
    padding: 10,
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  actions: {
    flexDirection: "row",
  },
  subText: {
    fontSize: 12,
    color: "#666",
  },
  block: {
    marginBottom: 8,
  },
  blockTitle: {
    fontWeight: "600",
  },
  notes: {
    fontStyle: "italic",
    color: "#555",
  },
});
