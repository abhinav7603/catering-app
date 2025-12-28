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

import { Linking } from "react-native";

import AsyncStorage from "@react-native-async-storage/async-storage";

import { saveOrderToCloud } from "../../services/cloud";

import { deleteOrderFromCloud } from "../../services/cloud";

import {
  Card,
  Divider,
  IconButton,
  Text,
  Button,
  TextInput,
  Portal,
  Dialog,
} from "react-native-paper";

import { useFocusEffect } from "@react-navigation/native";
import { loadOrdersFromCloud } from "../../services/cloud";

// ─── ANDROID ANIMATION ────────────────────────────────
if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ─── TYPES ────────────────────────────────────────────
type OrderBlock = {
  description: string;
  notes: string;
};

type Order = {
  id: string;
  clientName: string;
  mobile: string;
  address: string;
  dateTime: string;
  orderBlocks: OrderBlock[];
  quotationAmount: string;
  pdfUri: string;
  archived?: boolean; // 👈 ADD THIS

  paymentStatus?: "UNPAID" | "PARTIAL" | "PAID";
  paidAmount?: number;
  pendingAmount?: number;

  lastPaymentDate?: string;

  lastReminderSent?: string;

};


type Section = {
  title: string;
  data: Order[];
};

// ─── HELPERS ──────────────────────────────────────────

const resetPaymentToUnpaid = (order: Order): Order => {
  const cleaned: Order = {
    ...order,
    paymentStatus: "UNPAID",
    paidAmount: 0,
    pendingAmount: Number(order.quotationAmount),
  };

  // 🔥 Firebase-safe cleanup
  delete cleaned.lastPaymentDate;
  delete cleaned.lastReminderSent;

  return cleaned;
};

const parseIndianDate = (dateTime: string) => {
  // "12/11/2025 at 3:30 PM"
  const datePart = dateTime.split(" at ")[0]; // "12/11/2025"
  const [dd, mm, yyyy] = datePart.split("/").map(Number);

  return new Date(yyyy, mm - 1, dd); // JS month is 0-based
};

const isOneMonthPassed = (from: string) => {
  const fromDate = new Date(from);
  const now = new Date();

  const diffDays =
    (now.getTime() - fromDate.getTime()) /
    (1000 * 60 * 60 * 24);

  return diffDays >= 30;
};

const isReminderDue = (order: Order) => {

  // ⛔ Already reminded recently
if (order.lastReminderSent) {
  if (!isOneMonthPassed(order.lastReminderSent)) {
    return false;
  }
}

  // PAID → never
  if (order.paymentStatus === "PAID") return false;

  // PARTIAL → lastPaymentDate se
  if (order.paymentStatus === "PARTIAL" && order.lastPaymentDate) {
    return isOneMonthPassed(order.lastPaymentDate);
  }

  // UNPAID → order date se
  if (!order.paymentStatus || order.paymentStatus === "UNPAID") {
    const orderDate = parseIndianDate(order.dateTime).toISOString();
    return isOneMonthPassed(orderDate);
  }

  return false;
};


const filterByPeriod = (
  orders: Order[],
  period: "MONTH" | "YEAR",
  month: number,
  year: number
) => {
  return orders.filter(o => {
    const dateStr = o.dateTime.split(" at ")[0];
    const d = parseIndianDate(o.dateTime);

    if (period === "MONTH") {
      return (
        d.getMonth() === month &&
        d.getFullYear() === year
      );
    }

    // YEAR view
    return d.getFullYear() === year;
  });
};


const calculateStats = (orders: Order[]) => {
  let total = 0;
  let received = 0;
  let pending = 0;

  orders.forEach(o => {
    const amt = Number(o.quotationAmount) || 0;
    const paid = o.paidAmount || 0;

    total += amt;
    received += paid;
    pending += amt - paid;
  });

  return {
  total,
  received,
  pending,
  quotations: orders.length,
};

};

const shouldDeletePaidOrder = (order: Order) => {
  if (order.paymentStatus !== "PAID") return false;
  if (!order.lastPaymentDate) return false;

  const paidDate = new Date(order.lastPaymentDate);
  const now = new Date();

  const diffDays =
    (now.getTime() - paidDate.getTime()) / (1000 * 60 * 60 * 24);

  return diffDays >= 3; // 👈 yaha 3 ya 4 set kar sakta hai
};


const getQuotationNumber = (id: string) => {
  const m = id.match(/Q(\d+)/i);
  return m ? Number(m[1]) : 0;
};

const getPaymentColor = (status?: string) => {
  if (status === "PAID") return "#a2d6a4ff";     // light green
  if (status === "PARTIAL") return "#FFF3CD";  // light yellow
  return "#f0919bff";                            // light red
};

const sendWhatsAppReminder = (order: Order) => {
  if (!order.mobile) {
    Alert.alert("Mobile number not available");
    return;
  }

  let pending = 0;

if (order.paymentStatus === "PARTIAL") {
  pending = order.pendingAmount ?? 0;
} 
else if (
  !order.paymentStatus ||
  order.paymentStatus === "UNPAID"
) {
  pending = Number(order.quotationAmount);
} 
else {
  return; // PAID → reminder nahi
}


  const message = `Hello ${order.clientName} Ji,

This is a gentle follow-up regarding the pending payment of ₹${pending}
against quotation ${order.id}.

Looking forward to your confirmation.
Thank you.`;

  const url =
    "https://wa.me/91" +
    order.mobile +
    "?text=" +
    encodeURIComponent(message);

  Linking.openURL(url);


};

const groupOrders = (orders: Order[]): Section[] => {
  const map: Record<string, Order[]> = {};

  orders.forEach(o => {
    if (!o.dateTime) return; // 🔒 SAFETY

    const d = o.dateTime.split(" at ")[0] || "Unknown Date";

    if (!map[d]) map[d] = [];

    map[d].push(o);

    map[d].sort(
      (a, b) => getQuotationNumber(b.id) - getQuotationNumber(a.id)
    );
  });

  return Object.keys(map).map(d => ({
    title: d,
    data: map[d],
  }));
};

// ─── SCREEN ───────────────────────────────────────────
export default function PaymentsScreen() {
  const [allOrders, setAllOrders] = useState<Order[]>([]);

  const [sections, setSections] = useState<Section[]>([]);
  const [period, setPeriod] = useState<"MONTH" | "YEAR">("MONTH");

  const [selectedMonth, setSelectedMonth] = useState(
  new Date().getMonth() // 0 = Jan
);

const [selectedYear, setSelectedYear] = useState(
  new Date().getFullYear()
);


const [stats, setStats] = useState({
  total: 0,
  received: 0,
  pending: 0,
  quotations: 0,
});

const [showStats, setShowStats] = useState(false);

// ─── FUNNEL FILTER STATES ───────────────────────────
const [filterDialog, setFilterDialog] = useState(false);

const [filterYear, setFilterYear] = useState(
  new Date().getFullYear()
);

// null = poora year
const [filterMonth, setFilterMonth] = useState<number | null>(null);
const [isFunnelApplied, setIsFunnelApplied] = useState(false);


React.useEffect(() => {
  if (!showStats) return;

  let filteredOrders: Order[] = [];

  // 🟢 FUNNEL FILTER (only when applied)
  if (isFunnelApplied) {
    filteredOrders = allOrders.filter(o => {
      const d = parseIndianDate(o.dateTime);


      if (filterMonth === null) {
        return d.getFullYear() === filterYear;
      }

      return (
        d.getFullYear() === filterYear &&
        d.getMonth() === filterMonth
      );
    });
  } 
  // 🟡 QUICK FILTER (This Month / This Year)
  else {
    filteredOrders = filterByPeriod(
      allOrders,
      period,
      selectedMonth,
      selectedYear
    );
  }

  setStats(calculateStats(filteredOrders));
}, [
  showStats,
  period,
  selectedMonth,
  selectedYear,
  filterYear,
  filterMonth,
  isFunnelApplied,
  allOrders,
]);

  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [partialDialog, setPartialDialog] = useState(false);
  const [currentOrder, setCurrentOrder] = useState<Order | null>(null);
  const [partialAmount, setPartialAmount] = useState("");

  // ─── EXPAND / COLLAPSE ──────────────────────────────
  const toggleExpand = (id: string) => {
    LayoutAnimation.configureNext(
      LayoutAnimation.Presets.easeInEaseOut
    );
    setExpandedId(prev => (prev === id ? null : id));
  };

  // ─── LOAD ORDERS ────────────────────────────────────
  useFocusEffect(
    React.useCallback(() => {
      loadOrders();
    }, [])
  );

  const loadOrders = async () => {
    const raw = await AsyncStorage.getItem("orders");
    const local: Order[] = raw ? JSON.parse(raw) : [];

    setSections(groupOrders(local));

    const cloud = await loadOrdersFromCloud();
    if (!cloud?.length) return;

    const map = new Map<string, Order>();

local.forEach(o => {
  map.set(o.id, o);
});

cloud.forEach(o => {
  const existing = map.get(o.id);

  map.set(o.id, {
    ...o,
    paymentStatus: existing?.paymentStatus,
    paidAmount: existing?.paidAmount,
    pendingAmount: existing?.pendingAmount,
  });
});

    const merged = Array.from(map.values()).sort(
      
      (a, b) => getQuotationNumber(b.id) - getQuotationNumber(a.id)
    );

    await AsyncStorage.setItem("orders", JSON.stringify(merged));

    const periodOrders = filterByPeriod(
  merged,
  period,
  selectedMonth,
  selectedYear
);

setStats(calculateStats(periodOrders));

    setAllOrders(merged);
const visiblePayments = merged.filter(o => !o.archived);
setSections(groupOrders(visiblePayments));

merged.forEach(order => {
  if (isReminderDue(order)) {
    Alert.alert(
      "Payment Reminder Due",
      `Send reminder to ${order.clientName}?`,
      [
        { text: "Later" },
        {
          text: "Send",
          onPress: () => {
  sendWhatsAppReminder(order);
  updateOrder({
    ...order,
    lastReminderSent: new Date().toISOString(),
  });
},

        },
      ]
    );
  }
});

// 🧹 AUTO REMOVE OLD PAID PAYMENTS (3 days+)
merged.forEach(o => {
  if (shouldDeletePaidOrder(o) && !o.archived) {
    o.archived = true;
    saveOrderToCloud(sanitizeForFirebase(o)); // cloud me bhi save
  }
});



  };

  const sanitizeForFirebase = (obj: any) => {
  const clean: any = {};
  Object.keys(obj).forEach(key => {
    if (obj[key] !== undefined) {
      clean[key] = obj[key];
    }
  });
  return clean;
};

  const updateOrder = async (updated: Order) => {
  const raw = await AsyncStorage.getItem("orders");
  const list: Order[] = raw ? JSON.parse(raw) : [];

  const final = list.map(o =>
    o.id === updated.id ? updated : o
  );

  await AsyncStorage.setItem("orders", JSON.stringify(final));
  await saveOrderToCloud(sanitizeForFirebase(updated));

  // 🔥 ADD THESE TWO LINES
  setAllOrders(final);
  setSections(groupOrders(final));
};


  // ─── PAID ───────────────────────────────────────────
  const markPaid = (order: Order) => {
  // 🔁 IF ALREADY PAID → UNPAID
  if (order.paymentStatus === "PAID") {
    Alert.alert(
      "Undo Payment",
      "Mark this payment as UNPAID?",
      [
        { text: "Cancel" },
        {
          text: "Yes",
          style: "destructive",
          onPress: () => {
            const reverted = resetPaymentToUnpaid(order);
            updateOrder(reverted);
          },
        },
      ]
    );
    return;
  }

  // 🟢 ELSE → MARK AS PAID
  Alert.alert(
    "Mark as Paid",
    "Confirm full payment received?",
    [
      { text: "Cancel" },
      {
        text: "Confirm",
        onPress: () =>
          updateOrder({
            ...order,
            paymentStatus: "PAID",
            paidAmount: Number(order.quotationAmount),
            pendingAmount: 0,
            lastPaymentDate: new Date().toISOString(),
          }),
      },
    ]
  );
};

  // ─── PARTIAL ────────────────────────────────────────
  const openPartial = (order: Order) => {
    setCurrentOrder(order);
    setPartialAmount("");
    setPartialDialog(true);
  };

  const confirmPartial = () => {
    if (!currentOrder) return;

    const newPaid = Number(partialAmount);
const prevPaid = currentOrder.paidAmount || 0;
const total = Number(currentOrder.quotationAmount);

if (isNaN(total)) {
  Alert.alert("Invalid quotation amount");
  return;
}

const finalPaid = prevPaid + newPaid;

if (newPaid <= 0 || finalPaid >= total) {
  Alert.alert("Invalid amount");
  return;
}

updateOrder({
  ...currentOrder,
  paymentStatus: "PARTIAL",
  paidAmount: finalPaid,
  pendingAmount: total - finalPaid,
  lastPaymentDate: new Date().toISOString(),
});

    setPartialDialog(false);
  };

  // ─── UI ─────────────────────────────────────────────
  return (
    <View style={styles.container}>

       {showStats && (
  <>
    <View
  style={{
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  }}
>
  <Button
    mode={period === "MONTH" ? "contained" : "outlined"}
    onPress={() => {
  setIsFunnelApplied(false);
  setPeriod("MONTH");
}}

    style={{ marginRight: 6 }}
  >
    This Month
  </Button>

  <Button
    mode={period === "YEAR" ? "contained" : "outlined"}
    onPress={() => {
  setIsFunnelApplied(false);
  setPeriod("YEAR");
}}

  >
    This Year
  </Button>

  {/* FUNNEL ICON */}
  <IconButton
    icon="filter"
    onPress={() => setFilterDialog(true)}
    style={{ marginLeft: "auto" }}
  />
</View>

    <View style={styles.statsRow}>
      <Card style={[styles.statCard, { backgroundColor: "#4dbef7ff" }]}>
        <Text style={styles.statLabel}>Total</Text>
        <Text style={styles.statValue}>₹{stats.total}</Text>
      </Card>

      <Card style={[styles.statCard, { backgroundColor: "#3dce46ff" }]}>
        <Text style={styles.statLabel}>Received</Text>
        <Text style={styles.statValue}>₹{stats.received}</Text>
      </Card>

      <Card style={[styles.statCard, { backgroundColor: "#f15a5aff" }]}>
        <Text style={styles.statLabel}>Pending</Text>
        <Text style={styles.statValue}>₹{stats.pending}</Text>
      </Card>

      <Card style={[styles.statCard, { backgroundColor: "#c74a8fff" }]}>
  <Text style={styles.statLabel}>Quotations</Text>
  <Text style={styles.statValue}>{stats.quotations}</Text>
</Card>

    </View>
  </>
)}

      <SectionList
        sections={sections}
        keyExtractor={item => item.id}
        renderSectionHeader={({ section }) => (
  <TouchableOpacity
    onLongPress={() => setShowStats(s => !s)}
    delayLongPress={600}
  >
    <Text style={styles.sectionHeader}>
      {section.title}
    </Text>
  </TouchableOpacity>
)}

        renderItem={({ item }) => {
          const expanded = expandedId === item.id;

          return (
            <Card
              style={[
                styles.card,
                { backgroundColor: getPaymentColor(item.paymentStatus) },
              ]}
            >
              <TouchableOpacity onPress={() => toggleExpand(item.id)}>
                <View style={styles.row}>
                  <View>
                    <Text variant="titleMedium">
                      {item.clientName}
                    </Text>
                    <Text style={styles.subText}>
                      Quotation: {item.id}
                    </Text>
                  </View>

                  <IconButton
                    icon={expanded ? "chevron-up" : "chevron-down"}
                  />
                </View>
              </TouchableOpacity>

              <Text>📞 {item.mobile}</Text>
              <Text>📍 {item.address}</Text>

              <Text style={{ marginTop: 4 }}>
                💰 Amount: ₹{item.quotationAmount}
              </Text>

              {item.paymentStatus === "PARTIAL" && (
                <Text style={{ fontWeight: "600" }}>
                  Pending: ₹{item.pendingAmount}
                </Text>
              )}

              <Text style={{ fontWeight: "600", marginTop: 4 }}>
                Status: {item.paymentStatus || "UNPAID"}
              </Text>

              {expanded && (
  <View>
    <Divider style={{ marginVertical: 8 }} />

    <View style={styles.btnRow}>
      <Button
  mode={item.paymentStatus === "PAID" ? "outlined" : "contained"}
  textColor={item.paymentStatus === "PAID" ? "#B71C1C" : undefined}
  onPress={() => markPaid(item)}
>
  {item.paymentStatus === "PAID" ? "Unpaid" : "Paid"}
</Button>


      <Button mode="outlined" onPress={() => openPartial(item)}>
        Partial
      </Button>
    </View>

    {item.paymentStatus !== "PAID" && (
      <Button
        mode="text"
        icon="whatsapp"
        onPress={() => sendWhatsAppReminder(item)}
        style={{ marginTop: 6 }}
      >
        WhatsApp Reminder
      </Button>
    )}
  </View>
)}

            </Card>
          );
        }}
      />

      {/* PARTIAL PAYMENT DIALOG */}

      {/* ─── FUNNEL FILTER DIALOG ───────────────────────── */}
<Portal>
  <Dialog
    visible={filterDialog}
    onDismiss={() => setFilterDialog(false)}
  >
    <Dialog.Title>Filter Payments</Dialog.Title>

    <Dialog.Content>
      {/* YEAR */}
      <Text style={{ marginBottom: 4 }}>Select Year</Text>
      <TextInput
        mode="outlined"
        keyboardType="numeric"
        value={String(filterYear)}
        onChangeText={t => setFilterYear(Number(t))}
        style={{ marginBottom: 12 }}
      />

      {/* MONTH */}
      <Text style={{ marginBottom: 6 }}>
        Select Month (optional)
      </Text>

      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        {[
          "Jan","Feb","Mar","Apr","May","Jun",
          "Jul","Aug","Sep","Oct","Nov","Dec"
        ].map((m, i) => (
          <Button
            key={m}
            mode={filterMonth === i ? "contained" : "outlined"}
            onPress={() => setFilterMonth(i)}
            style={{ margin: 2 }}
          >
            {m}
          </Button>
        ))}
      </View>

      <Button
        onPress={() => setFilterMonth(null)}
        style={{ marginTop: 8 }}
      >
        Clear Month (Full Year)
      </Button>
    </Dialog.Content>

    <Dialog.Actions>
      <Button onPress={() => setFilterDialog(false)}>
        Cancel
      </Button>
      <Button
  mode="contained"
  onPress={() => {
    setIsFunnelApplied(true);
    setFilterDialog(false);
  }}
>
  Apply
</Button>
    </Dialog.Actions>
  </Dialog>
</Portal>
      
      <Portal>
        <Dialog
          visible={partialDialog}
          onDismiss={() => setPartialDialog(false)}
        >
          <Dialog.Title>Partial Payment</Dialog.Title>
          <Dialog.Content>
            <TextInput
              label="Amount received"
              keyboardType="numeric"
              value={partialAmount}
              onChangeText={setPartialAmount}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setPartialDialog(false)}>
              Cancel
            </Button>
            <Button onPress={confirmPartial}>Confirm</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}

// ─── STYLES ───────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, padding: 10 },
  sectionHeader: { fontSize: 16, fontWeight: "bold", marginVertical: 6 },
  card: { marginBottom: 10, padding: 10, borderRadius: 10 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  btnRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  subText: {
    fontSize: 12,
    opacity: 0.7,
  },

  statsRow: {
  flexDirection: "row",
  justifyContent: "space-between",
  marginBottom: 10,
},
statCard: {
  flex: 1,
  marginHorizontal: 4,
  padding: 10,
  borderRadius: 10,
},
statLabel: {
  color: "#fff",
  fontSize: 12,
},
statValue: {
  color: "#fff",
  fontSize: 16,
  fontWeight: "bold",
  marginTop: 4,
},
});
