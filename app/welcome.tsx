// app/welcome.tsx
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";

export default function Welcome() {
  return (
    <LinearGradient colors={["#fff5e6", "#ffe0b3"]} style={styles.container}>
      <StatusBar style="dark" />

      {/* TOP RIBBON */}
      <View style={styles.ribbonTop} />

      {/* LOGO */}
      <Image
        source={require("../assets/bbn_logo.png")}
        style={styles.logo}
      />

      <Text style={styles.welcome}>WELCOME TO</Text>

      <Text style={styles.title}>B.B.N CATERERS</Text>

      <Text style={styles.tagline}>Serving Taste, Tradition & Trust</Text>

      {/* BUTTON */}
      <TouchableOpacity
        style={styles.button}
        onPress={() => router.replace("(tabs)")}
      >
        <Text style={styles.buttonText}>Start New Quotation</Text>
      </TouchableOpacity>

      {/* BOTTOM RIBBON */}
      <View style={styles.ribbonBottom} />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  ribbonTop: {
    position: "absolute",
    top: 0,
    height: 14,
    width: "100%",
    backgroundColor: "#ff0000",
  },
  ribbonBottom: {
    position: "absolute",
    bottom: 0,
    height: 14,
    width: "100%",
    backgroundColor: "#ff0000",
  },
  logo: {
    width: 500,
    height: 500,
    borderRadius: 250,
    resizeMode: "contain",
    marginBottom: 20,
  },
  welcome: {
    fontSize: 40,
    fontWeight: "bold",
    color: "red",
    marginBottom: 8,
  },
  title: {
    fontSize: 60,
    fontWeight: "bold",
    color: "red",
    marginBottom: 50,
  },
  tagline: {
    fontSize: 30,
    fontStyle: "italic",
    color: "#444",
    marginBottom: 40,
    textAlign: "center",
  },
  button: {
    backgroundColor: "#0084ffff",
    paddingVertical: 20,
    paddingHorizontal: 100,
    borderRadius: 10,
    elevation: 4,
  },
  buttonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
  },
});
