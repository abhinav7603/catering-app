// app/(tabs)/index.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Platform,
  Linking,
  KeyboardAvoidingView,
} from 'react-native';
import {
  TextInput,
  Button,
  Text,
  RadioButton,
  Divider,
  Snackbar,
  IconButton,
} from 'react-native-paper';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';

export default function OrderFormScreen() {
  // ── State ───────────────────────────────────────────────────────
  const [clientName, setClientName] = useState('');
  const [mobile, setMobile] = useState('');
  const [address, setAddress] = useState('');
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [time, setTime] = useState(new Date());
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [mealType, setMealType] = useState('lunch');
  const [noOfGuests, setNoOfGuests] = useState('');
  const [menuItems, setMenuItems] = useState([{ name: '', qty: '', cost: '' }]);
  const [notes, setNotes] = useState('');
  const [orderId, setOrderId] = useState('');
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');

  // ── Auto-calculate total cost ───────────────────────────────────
  const calculatedTotal = menuItems.reduce((sum, item) => {
    const qty = parseFloat(item.qty) || 0;
    const cost = parseFloat(item.cost) || 0;
    return sum + qty * cost;
  }, 0);

  // ── Date / Time pickers ───────────────────────────────────────
  const onChangeDate = (_: any, selected?: Date) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (selected) setDate(selected);
  };
  const onChangeTime = (_: any, selected?: Date) => {
    setShowTimePicker(Platform.OS === 'ios');
    if (selected) setTime(selected);
  };
  const formatDateTime = () => {
    const d = `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
    const t = time
      .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
      .toLowerCase();
    return `${d} at ${t}`;
  };

  // ── Menu helpers ───────────────────────────────────────────────
  const addMenuItem = () => setMenuItems([...menuItems, { name: '', qty: '', cost: '' }]);
  const updateItem = (i: number, field: 'name' | 'qty' | 'cost', v: string) => {
    const copy = [...menuItems];
    copy[i][field] = v;
    setMenuItems(copy);
  };
  const removeItem = (i: number) => {
    if (menuItems.length > 1) setMenuItems(menuItems.filter((_, idx) => idx !== i));
  };

  // ── WhatsApp opener ─────────────────────────────────────────────
  const openWhatsApp = async (pdfUri: string) => {
    const phone = `91${mobile}`;
    const text = `Your order confirmation – Order #${orderId} | Total: ₹${calculatedTotal.toLocaleString('en-IN')}`;
    const url = `whatsapp://send?phone=${phone}&text=${encodeURIComponent(text)}`;

    const can = await Linking.canOpenURL(url);
    if (can) {
      await Linking.openURL(url);
      setTimeout(() => Sharing.shareAsync(pdfUri), 800);
    } else {
      await Sharing.shareAsync(pdfUri, { mimeType: 'application/pdf' });
    }
  };

  // ── Submit handler ─────────────────────────────────────────────
  const handleSubmit = async () => {
    // Validation
    if (!orderId.trim()) {
      setSnackbarMessage('Please enter an Order ID.');
      setSnackbarVisible(true);
      return;
    }
    if (!clientName || !mobile || !address || !noOfGuests || menuItems.some(i => !i.name)) {
      setSnackbarMessage('Please fill all required fields.');
      setSnackbarVisible(true);
      return;
    }
    if (mobile.length !== 10 || isNaN(Number(mobile))) {
      setSnackbarMessage('Mobile number must be 10 digits.');
      setSnackbarVisible(true);
      return;
    }
    if (calculatedTotal === 0) {
      setSnackbarMessage('Total cost is zero. Please enter valid Qty & Cost.');
      setSnackbarVisible(true);
      return;
    }

    const dateTime = formatDateTime();
    const [formattedDate, formattedTime] = dateTime.split(' at ');
    const mealTitle = mealType.charAt(0).toUpperCase() + mealType.slice(1);

    const menuRows = menuItems
      .map(
        i =>
          `<tr>
            <td style="padding:4px 8px;">${i.name}</td>
            <td style="padding:4px 8px;text-align:center;">${i.qty || '-'}</td>
            <td style="padding:4px 8px;text-align:right;">${i.cost ? `₹${parseFloat(i.cost).toLocaleString('en-IN')}` : '-'}</td>
          </tr>`
      )
      .join('');

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body {font-family:Arial,Helvetica,sans-serif;margin:30px;font-size:15px;color:#222;}
          .header{text-align:center;margin-bottom:20px;}
          .header h1{font-size:28px;color:#FF6B35;margin:0;}
          .header p{margin:4px 0;font-size:16px;font-weight:bold;}
          .hr{border-top:2px dashed #FF6B35;margin:15px 0;}
          .info{margin-bottom:12px;}
          .info strong{display:inline-block;width:130px;}
          table{width:100%;border-collapse:collapse;margin:15px 0;}
          th,td{border:1px solid #ddd;padding:6px 8px;}
          th{background:#fafafa;text-align:left;}
          .total{font-weight:bold;font-size:16px;margin-top:12px;}
          .footer{margin-top:30px;font-style:italic;text-align:center;font-size:13px;color:#555;}
        </style>
      </head>
      <body>
        <div class="header">
          <h1>B.B.N CATERERS</h1>
          <p>CATERERS | SWEETS | NAMKEEN | SNACKS</p>
          <p>PURE VEGETARIAN | INDOOR & OUTDOOR CATERING</p>
        </div>

        <div class="hr"></div>

        <p style="text-align:center;font-size:13px;">
          27, Channamal Park, East Punjabi Bagh, Near Ashoka Park Metro Station,<br>
          New Delhi-26  Phone: 9250928676 | 9540505607
        </p>

        <div class="info"><strong>Order ID:</strong> ${orderId}</div>
        <div class="info"><strong>Client Name:</strong> ${clientName}</div>
        <div class="info"><strong>Mobile:</strong> ${mobile}</div>
        <div class="info"><strong>Event Location:</strong> ${address}</div>
        <div class="info"><strong>Event:</strong> ${mealTitle}</div>
        <div class="info"><strong>Date:</strong> ${formattedDate}  <strong>Time:</strong> ${formattedTime}</div>
        <div class="info"><strong>No. of Guests:</strong> ${noOfGuests}</div>

        <table>
          <thead>
            <tr><th>Item</th><th style="width:80px;">Qty</th><th style="width:100px;">Cost</th></tr>
          </thead>
          <tbody>${menuRows}</tbody>
        </table>

        ${notes ? `<div class="info"><strong>Notes:</strong> ${notes}</div>` : ''}

        <div class="total">Total Cost: ₹${calculatedTotal.toLocaleString('en-IN')} (includes all hidden costs)</div>

        <p style="margin-top:20px;">
          For the menu provided by you,<br>
          we'll be glad to cater you for the above amount.
        </p>

        <p>Thank you<br>Regards,<br><strong>Team B.B.N CATERERS</strong></p>

        <div class="footer">
          WE LOOK FORWARD TO SERVE YOU FOR MANY MORE YEARS TO COME ...
        </div>
      </body>
      </html>
    `;

    try {
      // Generate PDF
      const { uri } = await Print.printToFileAsync({ html });

      // === NEW FILESYSTEM API ===
      // Use legacy expo-file-system API to move the generated PDF into the app document directory
                  // Some versions of the expo-file-system types may not expose `documentDirectory`,
                  // so access it via a type-unsafe cast and fall back to cacheDirectory or the temp URI.
                  const docDir = (FileSystem as any).documentDirectory ?? (FileSystem as any).cacheDirectory ?? '';
                  const fileName = `${orderId}_BBN_Caters.pdf`;
                  // If we couldn't determine a document directory, keep using the original temp URI
                  const finalUri = docDir ? `${docDir}${fileName}` : uri;
            
                  // Move the file from the temp print location to app document directory when possible
                  if (docDir) {
                    await FileSystem.moveAsync({ from: uri, to: finalUri });
                  }
      // Save order
      const order = {
        id: orderId,
        clientName,
        mobile,
        address,
        dateTime,
        mealType,
        noOfGuests,
        menuItems,
        notes,
        totalCost: calculatedTotal.toString(),
        pdfUri: finalUri,
      };

      const stored = await AsyncStorage.getItem('orders');
      const list = stored ? JSON.parse(stored) : [];
      list.push(order);
      await AsyncStorage.setItem('orders', JSON.stringify(list));

      await openWhatsApp(finalUri);

      setSnackbarMessage(`Order ${orderId} saved & sent`);
      setSnackbarVisible(true);

      // Reset form
      setClientName('');
      setMobile('');
      setAddress('');
      setDate(new Date());
      setTime(new Date());
      setMealType('lunch');
      setNoOfGuests('');
      setMenuItems([{ name: '', qty: '', cost: '' }]);
      setNotes('');
      setOrderId('');
    } catch (e) {
      console.error(e);
      setSnackbarMessage('Failed to create/send PDF');
      setSnackbarVisible(true);
    }
  };

  // ── UI ───────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1 }}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
    >
      <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
        <Text variant="headlineSmall" style={styles.header}>Client Details</Text>

        <TextInput
          label="Order ID (e.g. BBN001, CUST123)"
          mode="outlined"
          value={orderId}
          onChangeText={setOrderId}
          style={styles.input}
          placeholder="Enter unique ID"
        />

        <TextInput label="Client Name" mode="outlined" style={styles.input} value={clientName} onChangeText={setClientName} />
        <TextInput label="Mobile Number" mode="outlined" style={styles.input} keyboardType="phone-pad" value={mobile} onChangeText={setMobile} />
        <TextInput label="Event Location" mode="outlined" style={styles.input} multiline value={address} onChangeText={setAddress} />

        <View style={styles.dateTimeContainer}>
          <Button mode="outlined" onPress={() => setShowDatePicker(true)} style={styles.dateButton}>
            Date: {date.toLocaleDateString('en-GB')}
          </Button>
          {showDatePicker && <DateTimePicker value={date} mode="date" onChange={onChangeDate} />}
        </View>

        <View style={styles.dateTimeContainer}>
          <Button mode="outlined" onPress={() => setShowTimePicker(true)} style={styles.dateButton}>
            Time: {time.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
          </Button>
          {showTimePicker && <DateTimePicker value={time} mode="time" onChange={onChangeTime} />}
        </View>

        <Divider style={styles.divider} />

        <Text variant="headlineSmall" style={styles.header}>Order Details</Text>

        <Text style={styles.label}>Meal Type:</Text>
        <RadioButton.Group onValueChange={setMealType} value={mealType}>
          <View style={styles.radioContainer}>
            {['breakfast', 'lunch', 'dinner'].map(v => (
              <View key={v} style={styles.radioItem}>
                <RadioButton value={v} />
                <Text>{v.charAt(0).toUpperCase() + v.slice(1)}</Text>
              </View>
            ))}
          </View>
        </RadioButton.Group>

        <TextInput label="Number of Guests" mode="outlined" style={styles.input} keyboardType="numeric" value={noOfGuests} onChangeText={setNoOfGuests} />

        <Text variant="titleMedium" style={styles.label}>Menu Items:</Text>
        {menuItems.map((it, idx) => (
          <View key={idx} style={styles.menuItem}>
            <TextInput label="Item Name" mode="outlined" style={{ flex: 2 }} value={it.name} onChangeText={t => updateItem(idx, 'name', t)} />
            <TextInput label="Qty" mode="outlined" style={{ flex: 1, marginLeft: 8 }} keyboardType="numeric" value={it.qty} onChangeText={t => updateItem(idx, 'qty', t)} />
            <TextInput label="Cost" mode="outlined" style={{ flex: 1, marginLeft: 8 }} keyboardType="numeric" value={it.cost} onChangeText={t => updateItem(idx, 'cost', t)} />
            {menuItems.length > 1 && <IconButton icon="delete" size={20} onPress={() => removeItem(idx)} />}
          </View>
        ))}
        <Button mode="contained-tonal" icon="plus" style={styles.input} onPress={addMenuItem}>
          Add Menu Item
        </Button>

        <Divider style={styles.divider} />

        <Text variant="headlineSmall" style={styles.header}>Summary</Text>
        <TextInput label="Extra Notes (e.g., without onion)" mode="outlined" style={styles.input} multiline value={notes} onChangeText={setNotes} />

        {/* Auto-calculated Total */}
        <View style={styles.totalContainer}>
          <Text style={styles.totalLabel}>Total Cost:</Text>
          <Text style={styles.totalValue}>₹{calculatedTotal.toLocaleString('en-IN')}</Text>
        </View>

        <Button mode="contained" icon="whatsapp" style={styles.submitButton} onPress={handleSubmit}>
          Save & Send via WhatsApp
        </Button>

        <Snackbar
          visible={snackbarVisible}
          onDismiss={() => setSnackbarVisible(false)}
          duration={3000}
          style={{
            backgroundColor: snackbarMessage.includes('saved') ? '#51CF66' : '#FF6B6B',
          }}
        >
          <Text style={{ color: '#FFFFFF', fontWeight: '500' }}>{snackbarMessage}</Text>
        </Snackbar>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/* ── Modern Styles (2025 Palette) ───────────────────────────────── */
const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#F8F9FA',
  },
  header: {
    marginBottom: 12,
    color: '#212529',
    fontWeight: '600',
  },
  input: {
    marginBottom: 12,
    backgroundColor: '#FFFFFF',
  },
  divider: {
    marginVertical: 16,
    backgroundColor: '#DEE2E6',
  },
  label: {
    fontSize: 16,
    marginBottom: 8,
    color: '#212529',
    fontWeight: '500',
  },
  radioContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 12,
  },
  radioItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  menuItem: {
    flexDirection: 'row',
    marginBottom: 12,
    alignItems: 'center',
  },
  submitButton: {
    marginTop: 16,
    marginBottom: 32,
    paddingVertical: 10,
    backgroundColor: '#FF6B35',
    elevation: 4,
  },
  dateTimeContainer: {
    marginBottom: 12,
  },
  dateButton: {
    justifyContent: 'center',
    borderColor: '#DEE2E6',
  },
  totalContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 18,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FF6B35',
    elevation: 2,
    shadowColor: '#FF6B35',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  totalLabel: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#212529',
  },
  totalValue: {
    fontSize: 22,
    fontWeight: 'bold',
  },
});