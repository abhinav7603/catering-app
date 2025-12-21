// File: app/(tabs)/_layout.tsx

import React, { ReactElement } from "react";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={({ route }) => ({
        tabBarIcon: ({
          focused,
          color,
          size,
        }: {
          focused: boolean;
          color: string;
          size: number;
        }): ReactElement => {
          let iconName:
            | "add-circle"
            | "add-circle-outline"
            | "list"
            | "list-outline" = "list";

          if (route.name === "index") {
            iconName = focused
              ? "add-circle"
              : "add-circle-outline";
          }

          if (route.name === "history") {
            iconName = focused
              ? "list"
              : "list-outline";
          }

          return (
            <Ionicons
              name={iconName}
              size={size}
              color={color}
            />
          );
        },
        tabBarActiveTintColor: "#ff6600",
        tabBarInactiveTintColor: "gray",
      })}
    >
      {/* NEW ORDER */}
      <Tabs.Screen
        name="index"
        options={{
          title: "New Order",
          headerTitle: "B.B.N Caterers - New Order",
        }}
      />

      {/* ORDER HISTORY (ONLY ONCE) */}
      <Tabs.Screen
        name="history"
        options={{
          title: "Order History",
          headerTitle: "Order History",
        }}
      />
    </Tabs>
  );
}
<Tabs.Screen
  name="payments"
  options={{
    title: "Payments",
    headerTitle: "Payments & Dues",
  }}
/>

