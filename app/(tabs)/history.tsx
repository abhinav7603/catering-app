// app/(tabs)/history.tsx
import React, { useEffect, useState } from 'react';
import { View, StyleSheet, SectionList, Linking } from 'react-native';
import { Text, Button, Divider } from 'react-native-paper';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Sharing from 'expo-sharing';

type Order = {
  id: string;
  clientName: string;
  mobile: string;
  address: string;
  dateTime: string;
  mealType: string;
  noOfGuests: string;
  menuItems: { name: string; qty: string; cost: string }[];
  notes: string;
  totalCost: string;
  pdfUri: string;
};

export default function HistoryScreen() {
  const [sections, setSections] = useState<{ title: string; data: Order[] }[]>([]);

  const parseDate = (s: string): Date => {
    const [datePart, timePart] = s.split(' at ');
    const [d, m, y] = datePart.split('/').map(Number);
    const [t, ampm] = timePart.split(' ');
    let [h, min] = t.split(':').map(Number);
    if (ampm.toLowerCase() === 'pm' && h !== 12) h += 12;
    if (ampm.toLowerCase() === 'am' && h === 12) h = 0;
    return new Date(y, m - 1, d, h, min);
  };

  useEffect(() => {
    (async () => {
      const raw = await AsyncStorage.getItem('orders');
      if (!raw) return;
      let orders: Order[] = JSON.parse(raw);
      orders.sort((a, b) => parseDate(b.dateTime).getTime() - parseDate(a.dateTime).getTime());

      const groups: Record<string, Order[]> = {};
      orders.forEach(o => {
        const dt = parseDate(o.dateTime);
        const key = `${dt.toLocaleString('default', { month: 'long' })} ${dt.getFullYear()}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push(o);
      });

      setSections(Object.entries(groups).map(([title, data]) => ({ title, data })));
    })();
  }, []);

  const resend = async (order: Order) => {
    const phone = `91${order.mobile}`;
    const text = `Your order confirmation – Order #${order.id}`;
    const waUrl = `whatsapp://send?phone=${phone}&text=${encodeURIComponent(text)}`;

    const can = await Linking.canOpenURL(waUrl);
    if (can) {
      await Linking.openURL(waUrl);
      setTimeout(() => Sharing.shareAsync(order.pdfUri), 800);
    } else {
      await Sharing.shareAsync(order.pdfUri, { mimeType: 'application/pdf' });
    }
  };

  return (
    <View style={styles.container}>
      <SectionList
        sections={sections}
        keyExtractor={i => i.id}
        renderSectionHeader={({ section: { title } }) => (
          <Text variant="headlineSmall" style={styles.sectionHeader}>
            {title}
          </Text>
        )}
        renderItem={({ item }) => (
          <View style={styles.item}>
            <Text variant="titleMedium">
              {item.id} – {item.clientName} ({item.dateTime})
            </Text>
            <Text>Meal: {item.mealType.charAt(0).toUpperCase() + item.mealType.slice(1)}</Text>
            <Text>Guests: {item.noOfGuests}</Text>
            <Text>Total: ₹{item.totalCost}</Text>
            <Text>Mobile: {item.mobile}</Text>
            <Text>Location: {item.address}</Text>
            {item.notes && <Text>Notes: {item.notes}</Text>}
            <Text style={{ marginTop: 4 }}>Menu:</Text>
            {item.menuItems.map((m, i) => (
              <Text key={i}>• {m.name} (Qty: {m.qty || '–'}, Cost: {m.cost ? `₹${m.cost}` : '–'})</Text>
            ))}
            <Button mode="outlined" onPress={() => resend(item)} style={styles.btn}>
              Resend via WhatsApp
            </Button>
            <Divider style={styles.divider} />
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No orders yet.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#fff' },
  sectionHeader: { backgroundColor: '#f0f0f0', padding: 8, marginBottom: 8 },
  item: { marginBottom: 16 },
  btn: { marginTop: 8 },
  divider: { marginTop: 8 },
  empty: { textAlign: 'center', marginTop: 20, fontSize: 16 },
});