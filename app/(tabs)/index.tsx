// ─────────────────────────────────────────────────────────────
// app/(tabs)/index.tsx — CLEAN REBUILT VERSION
// ─────────────────────────────────────────────────────────────

import React, { useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import {
  KeyboardAvoidingView,
  Linking,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";

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

// FIX broken spaced Hindi letters (like "गु ला ब जा मु न")
function normalizeHindiSpacing(line) {
  return line.replace(/([\u0900-\u097F])\s+([\u0900-\u097F])/g, "$1$2");
}

function normalizeHindiUnicode(str) {
  return str.normalize("NFC");
}


async function transliterateLine(line) {
  const words = line.trim().split(/\s+/);
  let out = [];

  for (const w of words) {
    out.push(await transliterateWord(w));
  }

  return out.join(" ");
}

// --- HINDI → ENGLISH (Latin) Online Transliteration ---
async function hindiToEnglishOnline(text) {
  try {
    const url =
      "https://api.sanskritcloud.com/api/transliterate?" +
      "text=" + encodeURIComponent(text) +
      "&from=hi&to=eng";

    const response = await fetch(url);
    const raw = await response.text();  // API returns PLAIN TEXT

    if (!raw) return text;

    return raw.trim();  // "गुलाब जामुन" → "gulab jamun"
  } catch (e) {
    console.log("Hindi → Eng transliteration failed:", e);
    return text;
  }
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

// ─── COMPONENT ─────────────────────────────────────────────

export default function OrderFormScreen() {
  const [orderId, setOrderId] = useState<string>("");
  const [clientName, setClientName] = useState<string>("");
  const [mobile, setMobile] = useState<string>("");
  const [address, setAddress] = useState<string>("");
  const [isSharing, setIsSharing] = useState(false);

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

  const generateOrderId = async () => {
    if (!clientName) return "";

    const d = String(new Date().getDate()).padStart(2, "0");
    const m = String(new Date().getMonth() + 1).padStart(2, "0");
    const y = new Date().getFullYear();

    const base = `${clientName.toUpperCase().replace(/\s+/g, "")}${d}${m}${y}Q`;

    const stored = await AsyncStorage.getItem("orders");
    const orders = stored ? JSON.parse(stored) : [];
    const same = orders.filter((o: any) => o.id?.startsWith(base));

    const seq = String(same.length + 1).padStart(3, "0");
    return `${base}${seq}`;
  };

  useEffect(() => {
    generateOrderId().then((id) => {
      if (id) setOrderId(id);
    });
  }, [clientName]);

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

  const generateAndSavePDF = async () => {
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
  let clean = line.trim();

  // fix broken spaces
  clean = normalizeHindiSpacing(clean);

  // fix decomposed unicode (important!)
  clean = normalizeHindiUnicode(clean);
  clean = clean.replace(/\u200C|\u200D/g, ""); // remove hidden characters
  clean = clean.replace(/\u200B/g, "");
  clean = clean.trim();


  if (!clean) continue;

  let out = clean;

  // Hindi → English (Latin)
if (isHindi(clean)) {
  out = await hindiToEnglishOnline(clean);
}

  hindiLines.push(out);
}

        const menuHindi = hindiLines.join("\n");

        // NOTES
        let notesHindi = "";
if (b.notes) {
  const notesLines = b.notes.split("\n");
  let temp = [];

  for (let line of notesLines) {
    let clean = line.trim();

    clean = normalizeHindiSpacing(clean);
    clean = normalizeHindiUnicode(clean);
    clean = clean.replace(/\u200C|\u200D/g, "");
    clean = clean.replace(/\u200B/g, "");
    clean = clean.trim();

    if (!clean) continue;

    let out = clean;

    if (isHindi(clean)) {
      out = await hindiToEnglishOnline(clean);
    }

    temp.push(out);   // ⭐⭐ THIS LINE WAS MISSING ⭐⭐
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

    const logoAsset = Asset.fromModule(bbnLogo);
    await logoAsset.downloadAsync();

    const logoBase64 = await FileSystem.readAsStringAsync(
      logoAsset.localUri || logoAsset.uri,
      { encoding: FileSystem.EncodingType.Base64 }
    );

    const logoImgHtml = logoBase64
      ? `<img src="data:image/png;base64,${logoBase64}" style="width:110px;height:auto;object-fit:contain;" />`
      : `<div style="width:110px;height:40px;"></div>`;

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

    const { uri } = await Print.printToFileAsync({ html });
    const finalUri = FileSystem.cacheDirectory + `${orderId}.pdf`;
await FileSystem.copyAsync({ from: uri, to: finalUri });


    const now = new Date();
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
      id: orderId,
      clientName,
      mobile,
      address,
      dateTime, // ⭐ MOST IMPORTANT
      orderBlocks,
      quotationAmount,
      pdfUri: finalUri,
    };

    const stored = await AsyncStorage.getItem("orders");
    const list = stored ? JSON.parse(stored) : [];
    list.push(order);

    await AsyncStorage.setItem("orders", JSON.stringify(list));
    await saveClient();

    const debug = await AsyncStorage.getItem("orders");
    console.log("ORDERS IN STORAGE = ", debug);

    return { finalUri };
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
    if (isSharing) return; // double tap block
    setIsSharing(true);

    const result = await generateAndSavePDF();

    if (result) {
      try {
        await Sharing.shareAsync(result.finalUri, { mimeType: "application/pdf" });
      } catch (e) {
        console.log("SHARE FAILED:", e);
      }
    }

    setIsSharing(false);
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
        hindiLines.push(clean);
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

            temp.push(clean);
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

        const translated = await transliterateLine(clean);
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

          const tr = await transliterateLine(clean);
          temp.push(tr);
        }

        notesHindi = temp.join("\n");
      }

      // BUILD HTML BLOCK
      menuHTML += `
      <div style="margin-bottom:8px; font-size:14px;">
        <div style="font-weight:700;">EVENT ${i + 1}</div>
        <div style="display:flex; justify-content:space-between; font-size:20px; font-weight:500;">
  <div>DATE: ${date}</div>
  <div>TIME: ${time}</div>
  <div>GUESTS: ${b.guests || "—"}</div>
</div>

        <div><strong>MENU</strong><br/>
          ${menuHindi.replace(/\n/g, "<br/>")}
        </div>

        ${
          notesHindi
            ? `<div><strong>NOTES</strong><br/>${notesHindi.replace(
                /\n/g,
                "<br/>"
              )}</div>`
            : ""
        }
      </div>
    `;
    }

    const html = `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          @page { size: 80mm auto; margin: 6mm; }
          body { font-family: monospace; font-size: 12px; }
        </style>
      </head>
      <body>
        <div style="text-align:center;">
          <div><strong>CLIENT: ${clientName || "—"}</strong></div>
          <div>MOBILE: ${mobile || "—"}</div>
          <div>${address || "—"}</div>
        </div>
        <hr/>
        ${menuHTML}
      </body>
    </html>
  `;

    await ensureFolder();
    const { uri } = await Print.printToFileAsync({ html });
    const finalUri = `${BBN_DIR}${orderId}_workshop.pdf`;

    await FileSystem.copyAsync({ from: uri, to: finalUri });
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

          <Button mode="contained" style={[styles.btn, { backgroundColor: "#007BFF" }]} onPress={sendPDFOnly}>
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
