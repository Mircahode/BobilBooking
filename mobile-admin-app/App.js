/*
 * Bobil Booking — Admin-app (Expo / React Native)
 * -------------------------------------------------
 * Mobilversjon av admin-dashbordet (bobil_booking.html). Samme Supabase-
 * database, samme datamodell (app_state = privat JSON-blob per bruker).
 * Endringer du gjør her synkroniseres til skyen, og til de offentlige
 * tabellene (public_vehicles/public_bookings) som bestillingssiden og
 * kunde-appen leser fra.
 *
 * KJØRE PÅ IPHONEN DIN (ingen Mac / Xcode nødvendig):
 *   1. snack.expo.dev i nettleseren → lim inn hele denne filen i App.js
 *   2. Godta evt. popup om å legge til avhengigheter
 *      (@supabase/supabase-js, @react-native-async-storage/async-storage,
 *      expo-image-picker)
 *   3. Last ned "Expo Go" fra App Store, skann QR-koden i Snack
 *
 * Logg inn med samme e-post/passord som i admin-nettappen.
 */

import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  SafeAreaView,
  ScrollView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  FlatList,
  ActivityIndicator,
  Alert,
  StyleSheet,
  Platform,
  StatusBar,
  Switch,
  Image,
  KeyboardAvoidingView,
} from "react-native";
import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";

/* ===================== OPPSETT ===================== */
const SUPABASE_URL = "https://kydkjszbgdgvvkiicftg.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_maTxWGDwgcVBnpaCLNKGFA_UmrrPGLx";
const AUTH_EMAIL = "steffen.skaar@gmail.com";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

/* ===================== DATO-HJELPERE =====================
 * Lokale dato-komponenter (ikke UTC) — se tidligere feilretting av samme
 * bug i bestilling.html/index.html.
 */
function toISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function addDays(iso, n) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return toISO(d);
}
function todayISO() {
  return toISO(new Date());
}
function fmtDate(iso) {
  if (!iso) return "";
  return new Date(iso + "T00:00:00").toLocaleDateString("nb-NO", { day: "2-digit", month: "2-digit", year: "numeric" });
}
function fmtKr(n) {
  return Math.round(n || 0).toLocaleString("nb-NO") + " kr";
}
function nightsBetween(start, end) {
  const s = new Date(start + "T00:00:00"), e = new Date(end + "T00:00:00");
  return Math.round((e - s) / 86400000);
}
function isWeekendNight(dateStr) {
  const day = new Date(dateStr + "T00:00:00").getDay();
  return day === 5 || day === 6;
}
function isHighSeason(dateStr, vehicle) {
  if (!vehicle.hsStart || !vehicle.hsEnd) return false;
  const date = new Date(dateStr + "T00:00:00");
  const mmdd = (date.getMonth() + 1) * 100 + date.getDate();
  const parse = (s) => { const [dd, mm] = s.split("."); return (parseInt(mm, 10) || 0) * 100 + (parseInt(dd, 10) || 0); };
  const startMMDD = parse(vehicle.hsStart), endMMDD = parse(vehicle.hsEnd);
  if (startMMDD <= endMMDD) return mmdd >= startMMDD && mmdd <= endMMDD;
  return mmdd >= startMMDD || mmdd <= endMMDD;
}
function calcPrice(vehicle, start, end) {
  const n = nightsBetween(start, end);
  if (!vehicle || n <= 0) return { total: 0, nights: 0, breakdown: "" };
  let total = 0;
  const counts = { high: 0, weekend: 0, normal: 0 };
  for (let i = 0; i < n; i++) {
    const night = addDays(start, i);
    if (isHighSeason(night, vehicle) && vehicle.highSeasonRate) { total += Number(vehicle.highSeasonRate); counts.high++; }
    else if (isWeekendNight(night) && vehicle.weekendRate) { total += Number(vehicle.weekendRate); counts.weekend++; }
    else { total += Number(vehicle.dailyRate || 0); counts.normal++; }
  }
  const parts = [];
  if (counts.high) parts.push(`${counts.high} høysesong`);
  if (counts.weekend) parts.push(`${counts.weekend} helg`);
  if (counts.normal) parts.push(`${counts.normal} normal`);
  return { total, nights: n, breakdown: parts.join(", ") };
}
function bookingsOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

/* ===================== DB-HJELPERE ===================== */
function emptyDb() {
  return { vehicles: [], bookings: [], customers: [], costs: [], fixedCosts: [] };
}
function normalizeDb(raw) {
  const db = { ...emptyDb(), ...(raw || {}) };
  if (!Array.isArray(db.vehicles)) db.vehicles = [];
  if (!Array.isArray(db.bookings)) db.bookings = [];
  if (!Array.isArray(db.customers)) db.customers = [];
  if (!Array.isArray(db.costs)) db.costs = [];
  if (!Array.isArray(db.fixedCosts)) db.fixedCosts = [];
  db.bookings.forEach((b) => {
    if (b.depositPaid === undefined) b.depositPaid = false;
    if (b.depositReturned === undefined) b.depositReturned = false;
    if (b.rentPaid === undefined) b.rentPaid = false;
    if (b.damageImages === undefined) b.damageImages = [];
  });
  return db;
}
const COST_CATEGORIES = ["Service/vedlikehold", "Forsikring", "Vask/rens", "Parkering/oppstalling", "Drivstoff/gass", "EU-kontroll", "Avgifter", "Annet"];
const FIXED_COST_CATEGORIES = ["Lån/finansiering", "Forsikring", "Oppstalling/parkering", "Veihjelp/medlemskap", "Annet fast"];
const VEHICLE_COLORS = ["#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#a855f7", "#06b6d4", "#ec4899", "#64748b"];

/* ===================== STILER ===================== */
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f8fafc" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  screen: { flex: 1, paddingHorizontal: 12, paddingTop: 12, backgroundColor: "#f8fafc" },

  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 12, backgroundColor: "#fff",
    borderBottomWidth: 1, borderBottomColor: "#e2e8f0",
  },
  headerTitle: { fontSize: 18, fontWeight: "700", color: "#0f172a" },
  headerSubtitle: { fontSize: 12, color: "#64748b", marginTop: 2 },
  logoutText: { color: "#ef4444", fontWeight: "600" },

  tabStripWrap: {
    height: 44, flexGrow: 0, flexShrink: 0, backgroundColor: "#fff",
    borderBottomWidth: 1, borderBottomColor: "#e2e8f0",
  },
  tabStrip: { flexGrow: 0, flexShrink: 0 },
  tabStripContent: { paddingHorizontal: 12, alignItems: "stretch" },
  tabBtn: { justifyContent: "center", paddingHorizontal: 14, marginRight: 4 },
  tabBtnActive: { borderBottomWidth: 2, borderBottomColor: "#3b82f6" },
  tabBtnText: { color: "#64748b", fontWeight: "600", fontSize: 13 },
  tabBtnTextActive: { color: "#3b82f6" },

  sectionTitle: { fontSize: 15, fontWeight: "700", color: "#0f172a", marginBottom: 8 },
  mutedText: { color: "#64748b", fontSize: 13 },
  errorText: { color: "#ef4444", fontSize: 13, marginTop: 4, marginBottom: 4 },
  dangerText: { color: "#ef4444", fontWeight: "600", fontSize: 13 },
  fieldLabel: { fontSize: 12, fontWeight: "600", color: "#475569", marginBottom: 5 },
  loginTitle: { fontSize: 20, fontWeight: "700", color: "#0f172a", marginTop: 10 },

  input: {
    borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 8, paddingHorizontal: 12,
    paddingVertical: 10, fontSize: 15, backgroundColor: "#fff", color: "#0f172a",
  },

  primaryBtn: { backgroundColor: "#3b82f6", borderRadius: 10, paddingVertical: 13, alignItems: "center", marginTop: 4 },
  primaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  dangerBtn: { backgroundColor: "#fee2e2", borderRadius: 10, paddingVertical: 13, alignItems: "center", marginTop: 10 },
  dangerBtnText: { color: "#b91c1c", fontWeight: "700", fontSize: 15 },


  rowCard: {
    flexDirection: "row", backgroundColor: "#fff", borderRadius: 12, padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: "#e2e8f0", alignItems: "flex-start",
  },
  rowTitle: { fontSize: 15, fontWeight: "700", color: "#0f172a" },
  rowSubtitle: { fontSize: 13, color: "#334155", marginTop: 2 },

  requestCard: {
    backgroundColor: "#fff", borderRadius: 12, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: "#fde68a",
  },

  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  pillText: { fontSize: 11, fontWeight: "700" },

  filterChip: {
    borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 20, paddingHorizontal: 12,
    paddingVertical: 7, marginRight: 8, marginBottom: 8, backgroundColor: "#fff",
  },
  filterChipActive: { backgroundColor: "#3b82f6", borderColor: "#3b82f6" },
  filterChipText: { fontSize: 13, color: "#334155", fontWeight: "600" },
  filterChipTextActive: { color: "#fff" },

  colorSwatch: {
    width: 32, height: 32, borderRadius: 16, marginRight: 10, marginBottom: 10,
    borderWidth: 2, borderColor: "transparent",
  },
  colorSwatchActive: { borderColor: "#0f172a" },

  checkRow: { flexDirection: "row", alignItems: "center", marginBottom: 12, gap: 10 },

  modalHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#e2e8f0",
  },
  modalTitle: { fontSize: 17, fontWeight: "700", color: "#0f172a" },
  closeText: { color: "#3b82f6", fontWeight: "600", fontSize: 15 },
  modalBody: { flex: 1, paddingHorizontal: 14, paddingTop: 14 },

  damageThumb: { width: 72, height: 72, borderRadius: 8, backgroundColor: "#e2e8f0" },
  damageRemoveBtn: {
    position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: 10,
    backgroundColor: "#ef4444", alignItems: "center", justifyContent: "center",
  },
  addPhotoBtn: {
    width: 72, height: 72, borderRadius: 8, borderWidth: 1, borderColor: "#cbd5e1",
    borderStyle: "dashed", alignItems: "center", justifyContent: "center", backgroundColor: "#f8fafc",
  },

  calendarNav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  calendarNavBtn: { paddingHorizontal: 16, paddingVertical: 4 },
  calendarNavText: { fontSize: 22, color: "#3b82f6", fontWeight: "700" },
  weekdayRow: { flexDirection: "row" },
  weekdayText: { flex: 1, textAlign: "center", fontSize: 12, color: "#64748b", fontWeight: "600", marginBottom: 4 },
  calendarGrid: { flexDirection: "row", flexWrap: "wrap" },
  calendarCell: {
    width: `${100 / 7}%`, aspectRatio: 1, padding: 4, borderWidth: 0.5, borderColor: "#e2e8f0",
    alignItems: "center",
  },
  calendarCellSelected: { backgroundColor: "#dbeafe" },
  calendarCellToday: { backgroundColor: "#fef9c3" },
  calendarDayNum: { fontSize: 13, color: "#0f172a", fontWeight: "600" },

  /* --- dashbord (oversikt) --- */
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -4, marginBottom: 6 },
  kpiCard: {
    width: "50%", paddingHorizontal: 4, marginBottom: 8,
  },
  kpiInner: {
    backgroundColor: "#fff", borderRadius: 10, paddingVertical: 10, paddingHorizontal: 11,
    borderWidth: 1, borderColor: "#e2e8f0",
  },
  kpiLabel: { fontSize: 11, color: "#64748b", fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.3 },
  kpiValue: { fontSize: 19, fontWeight: "800", color: "#0f172a", marginTop: 2 },
  kpiSub: { fontSize: 11, color: "#94a3b8", marginTop: 1 },

  panel: {
    backgroundColor: "#fff", borderRadius: 10, padding: 12, marginBottom: 10,
    borderWidth: 1, borderColor: "#e2e8f0",
  },
  panelTitle: { fontSize: 14, fontWeight: "700", color: "#0f172a", marginBottom: 8 },

  barLabel: { fontSize: 12, color: "#334155", fontWeight: "600" },
  barTrack: { height: 8, borderRadius: 4, backgroundColor: "#f1f5f9", overflow: "hidden", marginTop: 3, marginBottom: 8 },

  attentionRow: {
    paddingVertical: 8, borderTopWidth: 1, borderTopColor: "#f1f5f9",
  },
  openText: { color: "#3b82f6", fontWeight: "600", fontSize: 13 },

  /* --- datovelger --- */
  dateFieldBtn: {
    borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 8, paddingHorizontal: 12,
    paddingVertical: 11, backgroundColor: "#fff", flexDirection: "row",
    alignItems: "center", justifyContent: "space-between",
  },
  dateFieldText: { fontSize: 15, color: "#0f172a" },
  dateFieldPlaceholder: { fontSize: 15, color: "#94a3b8" },
  dateSheet: {
    backgroundColor: "#fff", borderTopLeftRadius: 16, borderTopRightRadius: 16,
    paddingHorizontal: 14, paddingBottom: 24, paddingTop: 8,
  },
  dateSheetBackdrop: { flex: 1, backgroundColor: "rgba(15,23,42,0.4)", justifyContent: "flex-end" },
  quickRow: { flexDirection: "row", flexWrap: "wrap", marginTop: 8 },
});

/* ===================== ROT-APP ===================== */
export default function App() {
  const [checkingSession, setCheckingSession] = useState(true);
  const [session, setSession] = useState(null);
  const [db, setDb] = useState(null);
  const [loadingDb, setLoadingDb] = useState(false);
  const [syncStatus, setSyncStatus] = useState("");
  const [activeTab, setActiveTab] = useState("oversikt");
  const [pendingCount, setPendingCount] = useState(0);
  const [editingBooking, setEditingBooking] = useState(undefined); // undefined=lukket, null=ny, obj=rediger
  const saveTimer = useRef(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session || null);
      setCheckingSession(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session && !db) loadDb();
    if (!session) setDb(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const loadDb = useCallback(async () => {
    setLoadingDb(true);
    try {
      const userId = session?.user?.id || (await supabase.auth.getSession()).data.session?.user?.id;
      if (!userId) return;
      const { data, error } = await supabase.from("app_state").select("data").eq("user_id", userId).maybeSingle();
      if (error) throw error;
      if (data && data.data) {
        setDb(normalizeDb(data.data));
      } else {
        const fresh = emptyDb();
        setDb(fresh);
        pushDb(fresh);
      }
      refreshPendingCount();
    } catch (e) {
      console.error(e);
      Alert.alert("Feil", "Kunne ikke hente data fra skyen. Sjekk internettforbindelsen.");
    } finally {
      setLoadingDb(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const refreshPendingCount = useCallback(async () => {
    try {
      const { data } = await supabase.from("booking_requests").select("id").eq("status", "pending");
      setPendingCount(data ? data.length : 0);
    } catch (e) { /* stille */ }
  }, []);

  const pushDb = useCallback(async (newDb) => {
    try {
      setSyncStatus("Lagrer …");
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData?.session?.user?.id;
      if (!userId) return;
      const { error } = await supabase.from("app_state").upsert(
        { user_id: userId, data: newDb, updated_at: new Date().toISOString() },
        { onConflict: "user_id" }
      );
      if (error) throw error;
      setSyncStatus("☁️ Lagret");
      syncPublicData(newDb);
    } catch (e) {
      console.error(e);
      setSyncStatus("⚠️ Kunne ikke lagre");
    }
  }, []);

  const syncPublicData = useCallback(async (newDb) => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session) return;
      if (newDb.vehicles.length > 0) {
        await supabase.from("public_vehicles").upsert(
          newDb.vehicles.map((v) => ({
            id: v.id, name: v.name, regnr: v.regnr || "",
            daily_rate: v.dailyRate || 0, weekend_rate: v.weekendRate || 0,
            high_season_rate: v.highSeasonRate || 0,
            hs_start: v.hsStart || "", hs_end: v.hsEnd || "",
            color: v.color || "#3b82f6", notes: v.notes || "",
          }))
        );
        const ids = newDb.vehicles.map((v) => v.id);
        await supabase.from("public_vehicles").delete().not("id", "in", "(" + ids.map((id) => `"${id}"`).join(",") + ")");
      } else {
        await supabase.from("public_vehicles").delete().neq("id", "__never__");
      }
      await supabase.from("public_bookings").delete().neq("id", "__never__");
      const active = newDb.bookings.filter((b) => b.status !== "avlyst");
      if (active.length > 0) {
        await supabase.from("public_bookings").insert(
          active.map((b) => ({ id: b.id, vehicle_id: b.vehicleId, start_date: b.startDate, end_date: b.endDate }))
        );
      }
    } catch (e) {
      console.error("syncPublicData feilet:", e);
    }
  }, []);

  // commitDb: oppdater lokal state umiddelbart, lagre til sky debounced
  const commitDb = useCallback((newDb) => {
    setDb(newDb);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => pushDb(newDb), 500);
  }, [pushDb]);

  async function doLogout() {
    await supabase.auth.signOut();
    setDb(null);
    setActiveTab("oversikt");
  }

  if (checkingSession) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}><ActivityIndicator size="large" color="#3b82f6" /></View>
      </SafeAreaView>
    );
  }

  if (!session) {
    return <LoginScreen />;
  }

  if (loadingDb || !db) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#3b82f6" />
          <Text style={styles.mutedText}>Henter data …</Text>
        </View>
      </SafeAreaView>
    );
  }

  const TABS = [
    { key: "oversikt", label: "Oversikt" },
    { key: "kalender", label: "Kalender" },
    { key: "bookinger", label: "Bookinger" },
    { key: "biler", label: "Biler" },
    { key: "kunder", label: "Kunder" },
    { key: "kostnader", label: "Kostnader" },
    { key: "forespørsler", label: `Forespørsler${pendingCount ? ` (${pendingCount})` : ""}` },
  ];

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>🚐 Bobil Booking</Text>
          <Text style={styles.headerSubtitle}>{syncStatus || "Admin"}</Text>
        </View>
        <TouchableOpacity onPress={doLogout}><Text style={styles.logoutText}>Logg ut</Text></TouchableOpacity>
      </View>

      <View style={styles.tabStripWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tabStrip}
          contentContainerStyle={styles.tabStripContent}
        >
          {TABS.map((t) => (
            <TouchableOpacity key={t.key} onPress={() => setActiveTab(t.key)} style={[styles.tabBtn, activeTab === t.key && styles.tabBtnActive]}>
              <Text style={[styles.tabBtnText, activeTab === t.key && styles.tabBtnTextActive]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <View style={{ flex: 1 }}>
        {activeTab === "oversikt" && <OversiktScreen db={db} onOpenBooking={setEditingBooking} onGoTab={setActiveTab} />}
        {activeTab === "kalender" && <KalenderScreen db={db} onOpenBooking={setEditingBooking} />}
        {activeTab === "bookinger" && <BookingerScreen db={db} onOpenBooking={setEditingBooking} />}
        {activeTab === "biler" && <BilerScreen db={db} commitDb={commitDb} />}
        {activeTab === "kunder" && <KunderScreen db={db} commitDb={commitDb} />}
        {activeTab === "kostnader" && <KostnaderScreen db={db} commitDb={commitDb} />}
        {activeTab === "forespørsler" && (
          <ForesporslerScreen db={db} commitDb={commitDb} onCountChange={setPendingCount} />
        )}
      </View>

      <Modal visible={editingBooking !== undefined} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setEditingBooking(undefined)}>
        {editingBooking !== undefined && (
          <BookingEditor
            db={db}
            commitDb={commitDb}
            booking={editingBooking}
            onClose={() => setEditingBooking(undefined)}
          />
        )}
      </Modal>
    </SafeAreaView>
  );
}

/* ===================== LOGIN ===================== */
function LoginScreen() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function doLogin() {
    setError("");
    if (!password) { setError("Skriv inn passordet."); return; }
    setLoading(true);
    try {
      const { error: err } = await supabase.auth.signInWithPassword({ email: AUTH_EMAIL, password });
      if (err) setError("Feil passord, eller bruker ikke satt opp i Supabase ennå.");
    } catch (e) {
      console.error(e);
      setError("Kunne ikke koble til. Sjekk internettforbindelsen.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={styles.center}>
          <Text style={{ fontSize: 44 }}>🚐</Text>
          <Text style={styles.loginTitle}>Bobil Booking — Admin</Text>
          <Text style={styles.mutedText}>{AUTH_EMAIL}</Text>
          <TextInput
            style={[styles.input, { width: "100%", marginTop: 20 }]}
            placeholder="Passord"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={doLogin}
          />
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <TouchableOpacity style={[styles.primaryBtn, { width: "100%" }, loading && { opacity: 0.6 }]} onPress={doLogin} disabled={loading}>
            <Text style={styles.primaryBtnText}>{loading ? "Logger inn …" : "Logg inn"}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/* ===================== SMÅ HJELPE-KOMPONENTER ===================== */
function vehicleById(db, id) { return db.vehicles.find((v) => v.id === id); }
function customerById(db, id) { return db.customers.find((c) => c.id === id); }

function StatusPill({ status }) {
  const map = {
    bekreftet: { bg: "#dcfce7", fg: "#15803d", label: "Bekreftet" },
    forespørsel: { bg: "#fef9c3", fg: "#a16207", label: "Forespørsel" },
    avlyst: { bg: "#fee2e2", fg: "#b91c1c", label: "Avlyst" },
  };
  const s = map[status] || { bg: "#e2e8f0", fg: "#475569", label: status };
  return (
    <View style={[styles.pill, { backgroundColor: s.bg }]}>
      <Text style={[styles.pillText, { color: s.fg }]}>{s.label}</Text>
    </View>
  );
}

function BookingRow({ booking, db, onPress }) {
  const v = vehicleById(db, booking.vehicleId);
  const c = customerById(db, booking.customerId);
  return (
    <TouchableOpacity style={styles.rowCard} onPress={onPress}>
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: (v && v.color) || "#94a3b8", marginTop: 4 }} />
      <View style={{ flex: 1, marginLeft: 10 }}>
        <Text style={styles.rowTitle}>{(v && v.name) || "Ukjent bil"}</Text>
        <Text style={styles.rowSubtitle}>{(c && c.name) || "Ukjent kunde"}</Text>
        <Text style={styles.mutedText}>{fmtDate(booking.startDate)} – {fmtDate(booking.endDate)}</Text>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <StatusPill status={booking.status} />
        <Text style={[styles.mutedText, { marginTop: 6 }]}>{fmtKr(booking.totalPrice)}</Text>
      </View>
    </TouchableOpacity>
  );
}

/* ===================== OVERSIKT (dashbord) ===================== */
function totalMonthlyFixedCosts(db) {
  return db.fixedCosts.filter((f) => f.active !== false).reduce((s, f) => s + Number(f.amountPerMonth || 0), 0);
}

function DepositPill({ booking }) {
  if (!booking.deposit) return <View style={[styles.pill, { backgroundColor: "#e2e8f0" }]}><Text style={[styles.pillText, { color: "#64748b" }]}>Ingen</Text></View>;
  if (booking.depositReturned) return <View style={[styles.pill, { backgroundColor: "#dcfce7" }]}><Text style={[styles.pillText, { color: "#15803d" }]}>Returnert</Text></View>;
  if (booking.depositPaid) return <View style={[styles.pill, { backgroundColor: "#fef9c3" }]}><Text style={[styles.pillText, { color: "#a16207" }]}>Ikke returnert</Text></View>;
  return <View style={[styles.pill, { backgroundColor: "#fee2e2" }]}><Text style={[styles.pillText, { color: "#b91c1c" }]}>Ikke betalt</Text></View>;
}

function RentPill({ booking }) {
  return booking.rentPaid
    ? <View style={[styles.pill, { backgroundColor: "#dcfce7" }]}><Text style={[styles.pillText, { color: "#15803d" }]}>Leie betalt</Text></View>
    : <View style={[styles.pill, { backgroundColor: "#fee2e2" }]}><Text style={[styles.pillText, { color: "#b91c1c" }]}>Leie ubetalt</Text></View>;
}

function KpiCard({ label, value, sub, color }) {
  return (
    <View style={styles.kpiCard}>
      <View style={styles.kpiInner}>
        <Text style={styles.kpiLabel} numberOfLines={1}>{label}</Text>
        <Text style={[styles.kpiValue, color && { color }]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
        {!!sub && <Text style={styles.kpiSub} numberOfLines={1}>{sub}</Text>}
      </View>
    </View>
  );
}

function OversiktScreen({ db, onOpenBooking, onGoTab }) {
  const today = todayISO();
  const now = new Date();
  const yearNow = now.getFullYear();
  const monthStart = `${yearNow}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const nextMonth = now.getMonth() === 11 ? `${yearNow + 1}-01-01` : `${yearNow}-${String(now.getMonth() + 2).padStart(2, "0")}-01`;
  const yearStart = `${yearNow}-01-01`, nextYear = `${yearNow + 1}-01-01`;

  const inMonth = (d) => d >= monthStart && d < nextMonth;
  const inYear = (d) => d >= yearStart && d < nextYear;

  const confirmed = db.bookings.filter((b) => b.status === "bekreftet");
  const monthRevenue = confirmed.filter((b) => inMonth(b.startDate)).reduce((s, b) => s + Number(b.totalPrice || 0), 0);
  const yearRevenue = confirmed.filter((b) => inYear(b.startDate)).reduce((s, b) => s + Number(b.totalPrice || 0), 0);
  const monthFixedCosts = totalMonthlyFixedCosts(db);
  const yearFixedCosts = monthFixedCosts * (now.getMonth() + 1);
  const monthOneOff = db.costs.filter((k) => inMonth(k.date)).reduce((s, k) => s + Number(k.amount || 0), 0);
  const yearOneOff = db.costs.filter((k) => inYear(k.date)).reduce((s, k) => s + Number(k.amount || 0), 0);
  const monthCosts = monthOneOff + monthFixedCosts;
  const yearCosts = yearOneOff + yearFixedCosts;
  const monthProfit = monthRevenue - monthCosts;
  const yearProfit = yearRevenue - yearCosts;

  // Belegg denne måneden (streng-sammenligning = tidssone-trygt)
  const daysInMonth = new Date(yearNow, now.getMonth() + 1, 0).getDate();
  const totalAvailable = db.vehicles.length * daysInMonth;
  let bookedNights = 0;
  confirmed.forEach((b) => {
    const s = b.startDate > monthStart ? b.startDate : monthStart;
    const e = b.endDate < nextMonth ? b.endDate : nextMonth;
    if (e > s) bookedNights += nightsBetween(s, e);
  });
  const occupancy = totalAvailable > 0 ? Math.round((bookedNights / totalAvailable) * 100) : 0;

  const upcoming = db.bookings
    .filter((b) => b.status !== "avlyst" && b.endDate >= today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .slice(0, 6);

  const needsAttention = db.bookings.filter((b) => {
    if (b.status === "avlyst") return false;
    const depositIssue = b.deposit > 0 && !b.depositPaid && b.startDate <= addDays(today, 7) && b.startDate >= today;
    const returnIssue = b.deposit > 0 && b.depositPaid && !b.depositReturned && b.endDate <= today;
    const rentIssue = !b.rentPaid && b.startDate <= today;
    return depositIssue || returnIssue || rentIssue;
  }).sort((a, b) => a.endDate.localeCompare(b.endDate));

  const revenueByVehicle = db.vehicles
    .map((v) => ({ v, rev: confirmed.filter((b) => b.vehicleId === v.id && inYear(b.startDate)).reduce((s, b) => s + Number(b.totalPrice || 0), 0) }))
    .sort((a, b) => b.rev - a.rev);
  const maxRev = Math.max(1, ...revenueByVehicle.map((r) => r.rev));

  const GREEN = "#16a34a", RED = "#dc2626";

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 40 }}>
      <Text style={styles.sectionTitle}>Denne måneden</Text>
      <View style={styles.kpiGrid}>
        <KpiCard label="Inntekt" value={fmtKr(monthRevenue)} sub="Bekreftede bookinger" color={GREEN} />
        <KpiCard label="Kostnader" value={fmtKr(monthCosts)} sub={`herav ${fmtKr(monthFixedCosts)} faste`} color={RED} />
        <KpiCard label="Resultat" value={fmtKr(monthProfit)} color={monthProfit >= 0 ? GREEN : RED} />
        <KpiCard label="Belegg" value={`${occupancy}%`} sub={`${bookedNights} av ${totalAvailable} netter`} />
      </View>

      <Text style={styles.sectionTitle}>Hittil i år ({yearNow})</Text>
      <View style={styles.kpiGrid}>
        <KpiCard label="Inntekt i år" value={fmtKr(yearRevenue)} color={GREEN} />
        <KpiCard label="Kostnader i år" value={fmtKr(yearCosts)} sub={`herav ${fmtKr(yearFixedCosts)} faste`} color={RED} />
        <KpiCard label="Resultat i år" value={fmtKr(yearProfit)} color={yearProfit >= 0 ? GREEN : RED} />
        <KpiCard label="Antall biler" value={String(db.vehicles.length)} sub={`${db.customers.length} kunder registrert`} />
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Inntekt per bil i år</Text>
        {revenueByVehicle.length === 0 ? (
          <Text style={styles.mutedText}>Ingen biler lagt til ennå.</Text>
        ) : revenueByVehicle.map((r) => (
          <View key={r.v.id} style={{ marginBottom: 10 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
              <Text style={styles.barLabel}>{r.v.name}</Text>
              <Text style={styles.barLabel}>{fmtKr(r.rev)}</Text>
            </View>
            <View style={styles.barTrack}>
              <View style={{ height: "100%", width: `${(r.rev / maxRev) * 100}%`, backgroundColor: r.v.color || "#3b82f6", borderRadius: 5 }} />
            </View>
          </View>
        ))}
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>⚠️ Krever oppfølging</Text>
        {needsAttention.length === 0 ? (
          <Text style={styles.mutedText}>Ingen åpne saker akkurat nå. 🎉</Text>
        ) : needsAttention.map((b) => {
          const v = vehicleById(db, b.vehicleId), c = customerById(db, b.customerId);
          return (
            <TouchableOpacity key={b.id} style={styles.attentionRow} onPress={() => onOpenBooking(b)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{(v && v.name) || "Ukjent bil"} — {(c && c.name) || "Ukjent"}</Text>
                <Text style={styles.mutedText}>{fmtDate(b.startDate)} – {fmtDate(b.endDate)}</Text>
                <View style={{ flexDirection: "row", marginTop: 6, flexWrap: "wrap", gap: 6 }}>
                  <RentPill booking={b} />
                  <DepositPill booking={b} />
                </View>
              </View>
              <Text style={styles.openText}>Åpne ›</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Kommende bookinger</Text>
        {upcoming.length === 0 ? (
          <Text style={styles.mutedText}>Ingen kommende bookinger.</Text>
        ) : upcoming.map((b) => <BookingRow key={b.id} booking={b} db={db} onPress={() => onOpenBooking(b)} />)}
      </View>

      <TouchableOpacity style={styles.primaryBtn} onPress={() => onOpenBooking(null)}>
        <Text style={styles.primaryBtnText}>+ Ny booking</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

/* ===================== KALENDER ===================== */
const NB_MONTHS = ["Januar", "Februar", "Mars", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Desember"];
const NB_WEEKDAYS = ["Man", "Tir", "Ons", "Tor", "Fre", "Lør", "Søn"];

function buildMonthGrid(year, month) {
  // month: 0-indexed
  const first = new Date(year, month, 1);
  const startOffset = (first.getDay() + 6) % 7; // man=0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/* ===================== DATOVELGER ===================== */
function DateField({ value, onChange, placeholder, minDate, quick }) {
  const [open, setOpen] = useState(false);
  const base = value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1, 1) : new Date();
  const [cursor, setCursor] = useState({ y: base.getFullYear(), m: base.getMonth() });
  const cells = useMemo(() => buildMonthGrid(cursor.y, cursor.m), [cursor]);
  const today = todayISO();

  const openSheet = () => {
    const b = value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1, 1) : new Date();
    setCursor({ y: b.getFullYear(), m: b.getMonth() });
    setOpen(true);
  };
  const pick = (d) => {
    onChange(toISO(new Date(cursor.y, cursor.m, d)));
    setOpen(false);
  };
  const shift = (n) => {
    const d = new Date(cursor.y, cursor.m + n, 1);
    setCursor({ y: d.getFullYear(), m: d.getMonth() });
  };

  return (
    <>
      <TouchableOpacity style={styles.dateFieldBtn} onPress={openSheet}>
        <Text style={value ? styles.dateFieldText : styles.dateFieldPlaceholder}>
          {value ? fmtDate(value) : placeholder || "Velg dato"}
        </Text>
        <Text style={{ fontSize: 15 }}>📅</Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={styles.dateSheetBackdrop} activeOpacity={1} onPress={() => setOpen(false)}>
          <TouchableOpacity style={styles.dateSheet} activeOpacity={1} onPress={() => {}}>
            <View style={styles.calendarNav}>
              <TouchableOpacity style={styles.calendarNavBtn} onPress={() => shift(-1)}>
                <Text style={styles.calendarNavText}>‹</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>{NB_MONTHS[cursor.m]} {cursor.y}</Text>
              <TouchableOpacity style={styles.calendarNavBtn} onPress={() => shift(1)}>
                <Text style={styles.calendarNavText}>›</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.weekdayRow}>
              {NB_WEEKDAYS.map((w) => <Text key={w} style={styles.weekdayText}>{w}</Text>)}
            </View>

            <View style={styles.calendarGrid}>
              {cells.map((d, i) => {
                if (d === null) return <View key={`e${i}`} style={styles.calendarCell} />;
                const iso = toISO(new Date(cursor.y, cursor.m, d));
                const disabled = !!minDate && iso < minDate;
                const selected = iso === value;
                return (
                  <TouchableOpacity
                    key={iso}
                    disabled={disabled}
                    style={[styles.calendarCell, iso === today && styles.calendarCellToday, selected && styles.calendarCellSelected]}
                    onPress={() => pick(d)}
                  >
                    <Text style={[styles.calendarDayNum, disabled && { color: "#cbd5e1" }, selected && { color: "#1d4ed8", fontWeight: "800" }]}>{d}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.quickRow}>
              {(quick || [{ label: "I dag", iso: today }, { label: "I morgen", iso: addDays(today, 1) }, { label: "Om en uke", iso: addDays(today, 7) }]).map((q) => (
                <TouchableOpacity key={q.label} style={styles.filterChip} onPress={() => { onChange(q.iso); setOpen(false); }}>
                  <Text style={styles.filterChipText}>{q.label}</Text>
                </TouchableOpacity>
              ))}
              {!!value && (
                <TouchableOpacity style={styles.filterChip} onPress={() => { onChange(""); setOpen(false); }}>
                  <Text style={[styles.filterChipText, { color: "#b91c1c" }]}>Tøm</Text>
                </TouchableOpacity>
              )}
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

function KalenderScreen({ db, onOpenBooking }) {
  const now = new Date();
  const [cursor, setCursor] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [selectedDay, setSelectedDay] = useState(null);
  const cells = useMemo(() => buildMonthGrid(cursor.y, cursor.m), [cursor]);
  const activeBookings = db.bookings.filter((b) => b.status !== "avlyst");

  function bookingsOnDay(dayIso) {
    return activeBookings.filter((b) => dayIso >= b.startDate && dayIso < b.endDate);
  }

  function changeMonth(delta) {
    let m = cursor.m + delta, y = cursor.y;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    setCursor({ y, m });
    setSelectedDay(null);
  }

  const selectedBookings = selectedDay ? bookingsOnDay(selectedDay) : [];

  return (
    <View style={styles.screen}>
      <View style={styles.calendarNav}>
        <TouchableOpacity onPress={() => changeMonth(-1)} style={styles.calendarNavBtn}><Text style={styles.calendarNavText}>‹</Text></TouchableOpacity>
        <Text style={styles.sectionTitle}>{NB_MONTHS[cursor.m]} {cursor.y}</Text>
        <TouchableOpacity onPress={() => changeMonth(1)} style={styles.calendarNavBtn}><Text style={styles.calendarNavText}>›</Text></TouchableOpacity>
      </View>

      <View style={styles.weekdayRow}>
        {NB_WEEKDAYS.map((w) => <Text key={w} style={styles.weekdayText}>{w}</Text>)}
      </View>

      <View style={styles.calendarGrid}>
        {cells.map((day, i) => {
          if (day === null) return <View key={i} style={styles.calendarCell} />;
          const dayIso = `${cursor.y}-${String(cursor.m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const dayBookings = bookingsOnDay(dayIso);
          const isToday = dayIso === todayISO();
          const isSelected = dayIso === selectedDay;
          return (
            <TouchableOpacity
              key={i}
              style={[styles.calendarCell, isSelected && styles.calendarCellSelected, isToday && styles.calendarCellToday]}
              onPress={() => setSelectedDay(dayIso)}
            >
              <Text style={styles.calendarDayNum}>{day}</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 2 }}>
                {dayBookings.slice(0, 4).map((b) => {
                  const v = vehicleById(db, b.vehicleId);
                  return <View key={b.id} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: (v && v.color) || "#94a3b8", margin: 1 }} />;
                })}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView style={{ flex: 1, marginTop: 14 }}>
        <Text style={styles.sectionTitle}>{selectedDay ? fmtDate(selectedDay) : "Velg en dag"}</Text>
        {selectedDay && selectedBookings.length === 0 && <Text style={styles.mutedText}>Ingen bookinger denne dagen.</Text>}
        {selectedBookings.map((b) => <BookingRow key={b.id} booking={b} db={db} onPress={() => onOpenBooking(b)} />)}
      </ScrollView>
    </View>
  );
}

/* ===================== BOOKINGER ===================== */
const BOOKING_FILTERS = [
  { key: "alle", label: "Alle" },
  { key: "bekreftet", label: "Bekreftet" },
  { key: "forespørsel", label: "Forespørsel" },
  { key: "avlyst", label: "Avlyst" },
];

function BookingerScreen({ db, onOpenBooking }) {
  const [filter, setFilter] = useState("alle");
  const list = db.bookings
    .filter((b) => filter === "alle" || b.status === filter)
    .sort((a, b) => (a.startDate < b.startDate ? 1 : -1));

  return (
    <View style={styles.screen}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0, flexShrink: 0, marginBottom: 4 }}
        contentContainerStyle={{ alignItems: "center" }}
      >
        {BOOKING_FILTERS.map((f) => (
          <TouchableOpacity key={f.key} onPress={() => setFilter(f.key)} style={[styles.filterChip, filter === f.key && styles.filterChipActive]}>
            <Text style={[styles.filterChipText, filter === f.key && styles.filterChipTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <TouchableOpacity style={styles.primaryBtn} onPress={() => onOpenBooking(null)}>
        <Text style={styles.primaryBtnText}>+ Ny booking</Text>
      </TouchableOpacity>

      <FlatList
        style={{ marginTop: 10 }}
        data={list}
        keyExtractor={(b) => b.id}
        renderItem={({ item }) => <BookingRow booking={item} db={db} onPress={() => onOpenBooking(item)} />}
        ListEmptyComponent={<Text style={[styles.mutedText, { marginTop: 20 }]}>Ingen bookinger i denne kategorien.</Text>}
        contentContainerStyle={{ paddingBottom: 40 }}
      />
    </View>
  );
}

/* ===================== BILER ===================== */
function emptyVehicleForm() {
  return { id: null, name: "", regnr: "", dailyRate: "", weekendRate: "", highSeasonRate: "", hsStart: "", hsEnd: "", color: VEHICLE_COLORS[0], notes: "" };
}

function BilerScreen({ db, commitDb }) {
  const [editing, setEditing] = useState(null); // null=lukket, form-objekt ellers

  function openNew() { setEditing(emptyVehicleForm()); }
  function openEdit(v) {
    setEditing({
      id: v.id, name: v.name || "", regnr: v.regnr || "",
      dailyRate: String(v.dailyRate || ""), weekendRate: String(v.weekendRate || ""),
      highSeasonRate: String(v.highSeasonRate || ""),
      hsStart: v.hsStart || "", hsEnd: v.hsEnd || "",
      color: v.color || VEHICLE_COLORS[0], notes: v.notes || "",
    });
  }

  function save() {
    if (!editing.name.trim()) { Alert.alert("Mangler navn", "Bilen må ha et navn."); return; }
    const data = {
      id: editing.id || uid(),
      name: editing.name.trim(),
      regnr: editing.regnr.trim(),
      dailyRate: Number(editing.dailyRate) || 0,
      weekendRate: Number(editing.weekendRate) || 0,
      highSeasonRate: Number(editing.highSeasonRate) || 0,
      hsStart: editing.hsStart.trim(),
      hsEnd: editing.hsEnd.trim(),
      color: editing.color,
      notes: editing.notes,
    };
    const vehicles = editing.id ? db.vehicles.map((v) => (v.id === editing.id ? data : v)) : [...db.vehicles, data];
    commitDb({ ...db, vehicles });
    setEditing(null);
  }

  function remove(id) {
    const inUse = db.bookings.some((b) => b.vehicleId === id && b.status !== "avlyst");
    Alert.alert(
      "Slette bilen?",
      inUse ? "Denne bilen har aktive bookinger. Slette likevel?" : "Dette kan ikke angres.",
      [{ text: "Avbryt", style: "cancel" }, { text: "Slett", style: "destructive", onPress: () => {
        commitDb({ ...db, vehicles: db.vehicles.filter((v) => v.id !== id) });
        setEditing(null);
      } }]
    );
  }

  return (
    <View style={styles.screen}>
      <TouchableOpacity style={styles.primaryBtn} onPress={openNew}>
        <Text style={styles.primaryBtnText}>+ Ny bil</Text>
      </TouchableOpacity>

      <FlatList
        style={{ marginTop: 10 }}
        data={db.vehicles}
        keyExtractor={(v) => v.id}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.rowCard} onPress={() => openEdit(item)}>
            <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: item.color || "#94a3b8", marginTop: 3 }} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.rowTitle}>{item.name}</Text>
              <Text style={styles.rowSubtitle}>{item.regnr || "Uten regnr."}</Text>
              <Text style={styles.mutedText}>{fmtKr(item.dailyRate)}/natt · helg {fmtKr(item.weekendRate)} · høys. {fmtKr(item.highSeasonRate)}</Text>
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={[styles.mutedText, { marginTop: 20 }]}>Ingen biler lagt til ennå.</Text>}
        contentContainerStyle={{ paddingBottom: 40 }}
      />

      <Modal visible={!!editing} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setEditing(null)}>
        {editing && (
          <SafeAreaView style={styles.safe}>
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{editing.id ? "Rediger bil" : "Ny bil"}</Text>
                <TouchableOpacity onPress={() => setEditing(null)}><Text style={styles.closeText}>Lukk</Text></TouchableOpacity>
              </View>
              <ScrollView style={styles.modalBody} contentContainerStyle={{ paddingBottom: 40 }}>
                <FormField label="Navn"><TextInput style={styles.input} value={editing.name} onChangeText={(t) => setEditing({ ...editing, name: t })} placeholder="F.eks. Hobby Optima" /></FormField>
                <FormField label="Registreringsnummer"><TextInput style={styles.input} value={editing.regnr} onChangeText={(t) => setEditing({ ...editing, regnr: t })} autoCapitalize="characters" placeholder="AB 12345" /></FormField>
                <FormField label="Pris per natt (kr)"><TextInput style={styles.input} value={editing.dailyRate} onChangeText={(t) => setEditing({ ...editing, dailyRate: t })} keyboardType="numeric" placeholder="0" /></FormField>
                <FormField label="Helgepris per natt (kr)"><TextInput style={styles.input} value={editing.weekendRate} onChangeText={(t) => setEditing({ ...editing, weekendRate: t })} keyboardType="numeric" placeholder="Som normalpris" /></FormField>
                <FormField label="Høysesongpris per natt (kr)"><TextInput style={styles.input} value={editing.highSeasonRate} onChangeText={(t) => setEditing({ ...editing, highSeasonRate: t })} keyboardType="numeric" placeholder="Som normalpris" /></FormField>
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <FormField label="Høysesong fra (DD.MM)"><TextInput style={styles.input} value={editing.hsStart} onChangeText={(t) => setEditing({ ...editing, hsStart: t })} placeholder="15.06" /></FormField>
                  </View>
                  <View style={{ flex: 1 }}>
                    <FormField label="Høysesong til (DD.MM)"><TextInput style={styles.input} value={editing.hsEnd} onChangeText={(t) => setEditing({ ...editing, hsEnd: t })} placeholder="15.08" /></FormField>
                  </View>
                </View>
                <FormField label="Farge (i kalender)">
                  <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 6 }}>
                    {VEHICLE_COLORS.map((c) => (
                      <TouchableOpacity key={c} onPress={() => setEditing({ ...editing, color: c })} style={[styles.colorSwatch, { backgroundColor: c }, editing.color === c && styles.colorSwatchActive]} />
                    ))}
                  </View>
                </FormField>
                <FormField label="Notater"><TextInput style={[styles.input, { height: 80 }]} value={editing.notes} onChangeText={(t) => setEditing({ ...editing, notes: t })} multiline placeholder="Valgfritt" /></FormField>

                <TouchableOpacity style={styles.primaryBtn} onPress={save}><Text style={styles.primaryBtnText}>Lagre</Text></TouchableOpacity>
                {editing.id && (
                  <TouchableOpacity style={styles.dangerBtn} onPress={() => remove(editing.id)}><Text style={styles.dangerBtnText}>Slett bil</Text></TouchableOpacity>
                )}
              </ScrollView>
            </KeyboardAvoidingView>
          </SafeAreaView>
        )}
      </Modal>
    </View>
  );
}

/* ===================== KUNDER ===================== */
function emptyCustomerForm() { return { id: null, name: "", phone: "", email: "", notes: "" }; }

function KunderScreen({ db, commitDb }) {
  const [editing, setEditing] = useState(null);

  function openNew() { setEditing(emptyCustomerForm()); }
  function openEdit(c) { setEditing({ id: c.id, name: c.name || "", phone: c.phone || "", email: c.email || "", notes: c.notes || "" }); }

  function save() {
    if (!editing.name.trim()) { Alert.alert("Mangler navn", "Kunden må ha et navn."); return; }
    const data = { id: editing.id || uid(), name: editing.name.trim(), phone: editing.phone.trim(), email: editing.email.trim(), notes: editing.notes };
    const customers = editing.id ? db.customers.map((c) => (c.id === editing.id ? data : c)) : [...db.customers, data];
    commitDb({ ...db, customers });
    setEditing(null);
  }

  function remove(id) {
    const inUse = db.bookings.some((b) => b.customerId === id);
    Alert.alert(
      "Slette kunden?",
      inUse ? "Denne kunden har bookinger registrert. Slette likevel?" : "Dette kan ikke angres.",
      [{ text: "Avbryt", style: "cancel" }, { text: "Slett", style: "destructive", onPress: () => {
        commitDb({ ...db, customers: db.customers.filter((c) => c.id !== id) });
        setEditing(null);
      } }]
    );
  }

  return (
    <View style={styles.screen}>
      <TouchableOpacity style={styles.primaryBtn} onPress={openNew}>
        <Text style={styles.primaryBtnText}>+ Ny kunde</Text>
      </TouchableOpacity>

      <FlatList
        style={{ marginTop: 10 }}
        data={db.customers}
        keyExtractor={(c) => c.id}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.rowCard} onPress={() => openEdit(item)}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{item.name}</Text>
              {!!item.email && <Text style={styles.rowSubtitle}>{item.email}</Text>}
              {!!item.phone && <Text style={styles.mutedText}>{item.phone}</Text>}
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={[styles.mutedText, { marginTop: 20 }]}>Ingen kunder lagt til ennå.</Text>}
        contentContainerStyle={{ paddingBottom: 40 }}
      />

      <Modal visible={!!editing} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setEditing(null)}>
        {editing && (
          <SafeAreaView style={styles.safe}>
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{editing.id ? "Rediger kunde" : "Ny kunde"}</Text>
                <TouchableOpacity onPress={() => setEditing(null)}><Text style={styles.closeText}>Lukk</Text></TouchableOpacity>
              </View>
              <ScrollView style={styles.modalBody} contentContainerStyle={{ paddingBottom: 40 }}>
                <FormField label="Navn"><TextInput style={styles.input} value={editing.name} onChangeText={(t) => setEditing({ ...editing, name: t })} placeholder="Fornavn Etternavn" /></FormField>
                <FormField label="Telefon"><TextInput style={styles.input} value={editing.phone} onChangeText={(t) => setEditing({ ...editing, phone: t })} keyboardType="phone-pad" placeholder="+47 000 00 000" /></FormField>
                <FormField label="E-post"><TextInput style={styles.input} value={editing.email} onChangeText={(t) => setEditing({ ...editing, email: t })} autoCapitalize="none" keyboardType="email-address" placeholder="navn@epost.no" /></FormField>
                <FormField label="Notater"><TextInput style={[styles.input, { height: 80 }]} value={editing.notes} onChangeText={(t) => setEditing({ ...editing, notes: t })} multiline placeholder="Valgfritt" /></FormField>

                <TouchableOpacity style={styles.primaryBtn} onPress={save}><Text style={styles.primaryBtnText}>Lagre</Text></TouchableOpacity>
                {editing.id && (
                  <TouchableOpacity style={styles.dangerBtn} onPress={() => remove(editing.id)}><Text style={styles.dangerBtnText}>Slett kunde</Text></TouchableOpacity>
                )}
              </ScrollView>
            </KeyboardAvoidingView>
          </SafeAreaView>
        )}
      </Modal>
    </View>
  );
}

/* ===================== DELT FORM-FELT ===================== */
function FormField({ label, children }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

function ChipPicker({ options, value, onChange }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 6 }}>
      {options.map((opt) => (
        <TouchableOpacity key={opt} onPress={() => onChange(opt)} style={[styles.filterChip, value === opt && styles.filterChipActive]}>
          <Text style={[styles.filterChipText, value === opt && styles.filterChipTextActive]}>{opt}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function VehiclePicker({ db, value, onChange }) {
  if (db.vehicles.length === 0) return <Text style={styles.mutedText}>Ingen biler — legg til en bil først.</Text>;
  return <ChipPicker options={db.vehicles.map((v) => v.name)} value={(db.vehicles.find((v) => v.id === value) || {}).name} onChange={(name) => onChange((db.vehicles.find((v) => v.name === name) || {}).id)} />;
}

/* ===================== KOSTNADER ===================== */
function emptyCostForm() { return { id: null, vehicleId: "", date: todayISO(), category: COST_CATEGORIES[0], amount: "", notes: "" }; }
function emptyFixedCostForm() { return { id: null, vehicleId: "", category: FIXED_COST_CATEGORIES[0], amountPerMonth: "", active: true }; }

function KostnaderScreen({ db, commitDb }) {
  const [section, setSection] = useState("engangs"); // engangs | fast
  const [editingCost, setEditingCost] = useState(null);
  const [editingFixed, setEditingFixed] = useState(null);

  useEffect(() => {
    if (db.vehicles.length > 0) {
      setEditingCost((e) => (e && !e.id && !e.vehicleId ? { ...e, vehicleId: db.vehicles[0].id } : e));
    }
  }, [db.vehicles]);

  function openNewCost() { setEditingCost({ ...emptyCostForm(), vehicleId: db.vehicles[0] ? db.vehicles[0].id : "" }); }
  function openEditCost(k) { setEditingCost({ ...k, amount: String(k.amount || "") }); }
  function saveCost() {
    if (!editingCost.vehicleId) { Alert.alert("Mangler bil", "Du må velge en bil."); return; }
    const data = { id: editingCost.id || uid(), vehicleId: editingCost.vehicleId, date: editingCost.date || todayISO(), category: editingCost.category, amount: Number(editingCost.amount) || 0, notes: (editingCost.notes || "").trim() };
    const costs = editingCost.id ? db.costs.map((c) => (c.id === editingCost.id ? data : c)) : [...db.costs, data];
    commitDb({ ...db, costs });
    setEditingCost(null);
  }
  function removeCost(id) {
    Alert.alert("Slette kostnaden?", "Dette kan ikke angres.", [{ text: "Avbryt", style: "cancel" }, { text: "Slett", style: "destructive", onPress: () => { commitDb({ ...db, costs: db.costs.filter((c) => c.id !== id) }); setEditingCost(null); } }]);
  }

  function openNewFixed() { setEditingFixed({ ...emptyFixedCostForm(), vehicleId: db.vehicles[0] ? db.vehicles[0].id : "" }); }
  function saveFixed() {
    if (!editingFixed.vehicleId) { Alert.alert("Mangler bil", "Du må velge en bil."); return; }
    const data = { id: editingFixed.id || uid(), vehicleId: editingFixed.vehicleId, category: editingFixed.category, amountPerMonth: Number(editingFixed.amountPerMonth) || 0, active: editingFixed.active !== false };
    const fixedCosts = editingFixed.id ? db.fixedCosts.map((f) => (f.id === editingFixed.id ? data : f)) : [...db.fixedCosts, data];
    commitDb({ ...db, fixedCosts });
    setEditingFixed(null);
  }
  function toggleFixed(f) { commitDb({ ...db, fixedCosts: db.fixedCosts.map((x) => (x.id === f.id ? { ...x, active: x.active === false } : x)) }); }
  function removeFixed(id) {
    Alert.alert("Slette den faste kostnaden?", "Dette kan ikke angres.", [{ text: "Avbryt", style: "cancel" }, { text: "Slett", style: "destructive", onPress: () => commitDb({ ...db, fixedCosts: db.fixedCosts.filter((f) => f.id !== id) }) }]);
  }

  return (
    <View style={styles.screen}>
      <View style={{ flexDirection: "row", marginBottom: 10 }}>
        <TouchableOpacity onPress={() => setSection("engangs")} style={[styles.filterChip, section === "engangs" && styles.filterChipActive]}>
          <Text style={[styles.filterChipText, section === "engangs" && styles.filterChipTextActive]}>Engangskostnader</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setSection("fast")} style={[styles.filterChip, section === "fast" && styles.filterChipActive]}>
          <Text style={[styles.filterChipText, section === "fast" && styles.filterChipTextActive]}>Faste kostnader</Text>
        </TouchableOpacity>
      </View>

      {section === "engangs" ? (
        <>
          <TouchableOpacity style={styles.primaryBtn} onPress={openNewCost}><Text style={styles.primaryBtnText}>+ Ny kostnad</Text></TouchableOpacity>
          <FlatList
            style={{ marginTop: 10 }}
            data={[...db.costs].sort((a, b) => (a.date < b.date ? 1 : -1))}
            keyExtractor={(c) => c.id}
            renderItem={({ item }) => {
              const v = vehicleById(db, item.vehicleId);
              return (
                <TouchableOpacity style={styles.rowCard} onPress={() => openEditCost(item)}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{item.category}</Text>
                    <Text style={styles.rowSubtitle}>{(v && v.name) || "Ukjent bil"} · {fmtDate(item.date)}</Text>
                    {!!item.notes && <Text style={styles.mutedText}>{item.notes}</Text>}
                  </View>
                  <Text style={styles.rowTitle}>{fmtKr(item.amount)}</Text>
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={<Text style={[styles.mutedText, { marginTop: 20 }]}>Ingen kostnader registrert.</Text>}
            contentContainerStyle={{ paddingBottom: 40 }}
          />
        </>
      ) : (
        <>
          <TouchableOpacity style={styles.primaryBtn} onPress={openNewFixed}><Text style={styles.primaryBtnText}>+ Ny fast kostnad</Text></TouchableOpacity>
          <FlatList
            style={{ marginTop: 10 }}
            data={db.fixedCosts}
            keyExtractor={(f) => f.id}
            renderItem={({ item }) => {
              const v = vehicleById(db, item.vehicleId);
              return (
                <View style={styles.rowCard}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{item.category}</Text>
                    <Text style={styles.rowSubtitle}>{(v && v.name) || "Ukjent bil"} · {fmtKr(item.amountPerMonth)}/mnd</Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Switch value={item.active !== false} onValueChange={() => toggleFixed(item)} />
                    <TouchableOpacity onPress={() => removeFixed(item.id)}><Text style={[styles.dangerText, { marginTop: 6 }]}>Slett</Text></TouchableOpacity>
                  </View>
                </View>
              );
            }}
            ListEmptyComponent={<Text style={[styles.mutedText, { marginTop: 20 }]}>Ingen faste kostnader registrert.</Text>}
            contentContainerStyle={{ paddingBottom: 40 }}
          />
        </>
      )}

      <Modal visible={!!editingCost} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setEditingCost(null)}>
        {editingCost && (
          <SafeAreaView style={styles.safe}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingCost.id ? "Rediger kostnad" : "Ny kostnad"}</Text>
              <TouchableOpacity onPress={() => setEditingCost(null)}><Text style={styles.closeText}>Lukk</Text></TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody} contentContainerStyle={{ paddingBottom: 40 }}>
              <FormField label="Bil"><VehiclePicker db={db} value={editingCost.vehicleId} onChange={(id) => setEditingCost({ ...editingCost, vehicleId: id })} /></FormField>
              <FormField label="Dato"><DateField value={editingCost.date} onChange={(d) => setEditingCost({ ...editingCost, date: d })} /></FormField>
              <FormField label="Kategori"><ChipPicker options={COST_CATEGORIES} value={editingCost.category} onChange={(c) => setEditingCost({ ...editingCost, category: c })} /></FormField>
              <FormField label="Beløp (kr)"><TextInput style={styles.input} value={editingCost.amount} onChangeText={(t) => setEditingCost({ ...editingCost, amount: t })} keyboardType="numeric" placeholder="0" /></FormField>
              <FormField label="Notater"><TextInput style={[styles.input, { height: 70 }]} value={editingCost.notes} onChangeText={(t) => setEditingCost({ ...editingCost, notes: t })} multiline placeholder="Valgfritt" /></FormField>
              <TouchableOpacity style={styles.primaryBtn} onPress={saveCost}><Text style={styles.primaryBtnText}>Lagre</Text></TouchableOpacity>
              {editingCost.id && <TouchableOpacity style={styles.dangerBtn} onPress={() => removeCost(editingCost.id)}><Text style={styles.dangerBtnText}>Slett</Text></TouchableOpacity>}
            </ScrollView>
          </SafeAreaView>
        )}
      </Modal>

      <Modal visible={!!editingFixed} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setEditingFixed(null)}>
        {editingFixed && (
          <SafeAreaView style={styles.safe}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Ny fast kostnad</Text>
              <TouchableOpacity onPress={() => setEditingFixed(null)}><Text style={styles.closeText}>Lukk</Text></TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody} contentContainerStyle={{ paddingBottom: 40 }}>
              <FormField label="Bil"><VehiclePicker db={db} value={editingFixed.vehicleId} onChange={(id) => setEditingFixed({ ...editingFixed, vehicleId: id })} /></FormField>
              <FormField label="Kategori"><ChipPicker options={FIXED_COST_CATEGORIES} value={editingFixed.category} onChange={(c) => setEditingFixed({ ...editingFixed, category: c })} /></FormField>
              <FormField label="Beløp per måned (kr)"><TextInput style={styles.input} value={editingFixed.amountPerMonth} onChangeText={(t) => setEditingFixed({ ...editingFixed, amountPerMonth: t })} keyboardType="numeric" placeholder="0" /></FormField>
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 14 }}>
                <Switch value={editingFixed.active !== false} onValueChange={(v) => setEditingFixed({ ...editingFixed, active: v })} />
                <Text style={[styles.fieldLabel, { marginLeft: 10 }]}>Aktiv (regnes med i dashbordet)</Text>
              </View>
              <TouchableOpacity style={styles.primaryBtn} onPress={saveFixed}><Text style={styles.primaryBtnText}>Lagre</Text></TouchableOpacity>
            </ScrollView>
          </SafeAreaView>
        )}
      </Modal>
    </View>
  );
}

/* ===================== FORESPØRSLER ===================== */
function ForesporslerScreen({ db, commitDb, onCountChange }) {
  const [requests, setRequests] = useState(null); // null = laster
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    try {
      const { data, error } = await supabase.from("booking_requests").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      const reqs = data || [];
      setRequests(reqs);
      onCountChange(reqs.filter((r) => r.status === "pending").length);
    } catch (e) {
      console.error(e);
      Alert.alert("Feil", "Kunne ikke laste forespørsler.");
      setRequests([]);
    }
  }, [onCountChange]);

  useEffect(() => { load(); }, [load]);

  async function approve(r) {
    const overlap = db.bookings.find((b) => b.vehicleId === r.vehicle_id && b.status !== "avlyst" && bookingsOverlap(r.start_date, r.end_date, b.startDate, b.endDate));
    if (overlap) {
      Alert.alert("Kan ikke godkjenne", `Det finnes allerede en booking for denne perioden (${fmtDate(overlap.startDate)}–${fmtDate(overlap.endDate)}). Håndter overlappet først.`);
      return;
    }
    setBusyId(r.id);
    try {
      let customer = db.customers.find((c) => c.email && r.customer_email && c.email.toLowerCase() === r.customer_email.toLowerCase());
      let customers = db.customers;
      if (!customer) {
        customer = { id: uid(), name: r.customer_name, email: r.customer_email || "", phone: r.customer_phone || "", notes: "Opprettet fra forespørsel" };
        customers = [...db.customers, customer];
      }
      const vehicle = vehicleById(db, r.vehicle_id);
      const priceCalc = vehicle ? calcPrice(vehicle, r.start_date, r.end_date) : { total: 0 };
      const newBooking = {
        id: uid(), vehicleId: r.vehicle_id, customerId: customer.id,
        startDate: r.start_date, endDate: r.end_date,
        totalPrice: priceCalc.total || 0, deposit: 0,
        status: "bekreftet", notes: "Opprettet fra forespørsel",
        rentPaid: false, depositPaid: false, depositReturned: false,
        damageImages: [], createdAt: new Date().toISOString(),
      };
      commitDb({ ...db, customers, bookings: [...db.bookings, newBooking] });
      const { error } = await supabase.from("booking_requests").update({ status: "approved" }).eq("id", r.id);
      if (error) throw error;
      Alert.alert("Godkjent", "Booking lagt til! Husk å sjekke pris og depositum under 'Bookinger'.");
      await load();
    } catch (e) {
      console.error(e);
      Alert.alert("Feil", "Kunne ikke godkjenne forespørselen.");
    } finally {
      setBusyId(null);
    }
  }

  function reject(r) {
    Alert.alert("Avslå forespørselen?", `${r.customer_name} — ${fmtDate(r.start_date)} til ${fmtDate(r.end_date)}`, [
      { text: "Avbryt", style: "cancel" },
      { text: "Avslå", style: "destructive", onPress: async () => {
        setBusyId(r.id);
        try {
          const { error } = await supabase.from("booking_requests").update({ status: "rejected" }).eq("id", r.id);
          if (error) throw error;
          await load();
        } catch (e) {
          console.error(e);
          Alert.alert("Feil", "Kunne ikke avslå forespørselen.");
        } finally {
          setBusyId(null);
        }
      } },
    ]);
  }

  if (requests === null) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#3b82f6" /></View>;
  }

  const pending = requests.filter((r) => r.status === "pending");
  const handled = requests.filter((r) => r.status !== "pending");

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 40 }}>
      <Text style={styles.sectionTitle}>Ventende forespørsler ({pending.length})</Text>
      {pending.length === 0 && <Text style={styles.mutedText}>Ingen ventende forespørsler.</Text>}
      {pending.map((r) => (
        <View key={r.id} style={styles.requestCard}>
          <Text style={styles.rowTitle}>{r.vehicle_name || "Ukjent bil"}</Text>
          <Text style={styles.rowSubtitle}>{r.customer_name}</Text>
          <Text style={styles.mutedText}>{fmtDate(r.start_date)} – {fmtDate(r.end_date)}</Text>
          {!!r.customer_email && <Text style={styles.mutedText}>{r.customer_email}</Text>}
          {!!r.customer_phone && <Text style={styles.mutedText}>{r.customer_phone}</Text>}
          {!!r.message && <Text style={[styles.mutedText, { marginTop: 4, fontStyle: "italic" }]}>"{r.message}"</Text>}
          <View style={{ flexDirection: "row", marginTop: 10 }}>
            <TouchableOpacity style={[styles.primaryBtn, { flex: 1, marginRight: 8, opacity: busyId === r.id ? 0.6 : 1 }]} disabled={busyId === r.id} onPress={() => approve(r)}>
              <Text style={styles.primaryBtnText}>✅ Godkjenn</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.dangerBtn, { flex: 1, opacity: busyId === r.id ? 0.6 : 1 }]} disabled={busyId === r.id} onPress={() => reject(r)}>
              <Text style={styles.dangerBtnText}>✗ Avslå</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}

      {handled.length > 0 && (
        <>
          <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Behandlede forespørsler</Text>
          {handled.map((r) => (
            <View key={r.id} style={styles.rowCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{r.vehicle_name || "Ukjent bil"}</Text>
                <Text style={styles.rowSubtitle}>{r.customer_name}</Text>
                <Text style={styles.mutedText}>{fmtDate(r.start_date)} – {fmtDate(r.end_date)}</Text>
              </View>
              <StatusPill status={r.status === "approved" ? "bekreftet" : "avlyst"} />
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

/* ===================== BOOKING EDITOR (delt modal) ===================== */
function BookingEditor({ db, commitDb, booking, onClose }) {
  const isNew = booking === null;
  const [form, setForm] = useState(() => {
    if (booking) {
      return {
        vehicleId: booking.vehicleId, customerId: booking.customerId,
        startDate: booking.startDate, endDate: booking.endDate,
        totalPrice: String(booking.totalPrice || ""), deposit: String(booking.deposit || ""),
        status: booking.status, notes: booking.notes || "",
        depositPaid: !!booking.depositPaid, depositPaidDate: booking.depositPaidDate || "",
        depositReturned: !!booking.depositReturned, depositReturnedDate: booking.depositReturnedDate || "",
        depositReturnedAmount: booking.depositReturnedAmount !== undefined ? String(booking.depositReturnedAmount) : "",
        depositNotes: booking.depositNotes || "",
        rentPaid: !!booking.rentPaid,
        kmStart: booking.kmStart !== undefined && booking.kmStart !== null ? String(booking.kmStart) : "",
        kmEnd: booking.kmEnd !== undefined && booking.kmEnd !== null ? String(booking.kmEnd) : "",
        damageNotes: booking.damageNotes || "",
        damageImages: Array.isArray(booking.damageImages) ? booking.damageImages.slice() : [],
        priceAuto: false,
      };
    }
    const start = todayISO();
    return {
      vehicleId: db.vehicles[0] ? db.vehicles[0].id : "", customerId: db.customers[0] ? db.customers[0].id : "",
      startDate: start, endDate: addDays(start, 1),
      totalPrice: "", deposit: "", status: "bekreftet", notes: "",
      depositPaid: false, depositPaidDate: "", depositReturned: false, depositReturnedDate: "",
      depositReturnedAmount: "", depositNotes: "", rentPaid: false,
      kmStart: "", kmEnd: "", damageNotes: "", damageImages: [], priceAuto: true,
    };
  });

  const vehicle = vehicleById(db, form.vehicleId);
  const priceCalc = vehicle && form.startDate && form.endDate && form.endDate > form.startDate ? calcPrice(vehicle, form.startDate, form.endDate) : null;

  useEffect(() => {
    if (priceCalc && form.priceAuto) {
      setForm((f) => ({ ...f, totalPrice: String(priceCalc.total) }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.vehicleId, form.startDate, form.endDate]);

  const conflict = db.bookings.some((b) => b.id !== (booking && booking.id) && b.vehicleId === form.vehicleId && b.status !== "avlyst" && bookingsOverlap(form.startDate, form.endDate, b.startDate, b.endDate));

  const kmStartNum = Number(form.kmStart), kmEndNum = Number(form.kmEnd);
  const hasKm = form.kmStart !== "" && form.kmEnd !== "";
  const kmDrivenText = hasKm ? (kmEndNum >= kmStartNum ? `${kmEndNum - kmStartNum} km kjørt i perioden.` : "⚠️ Kilometerstand ved levering kan ikke være lavere enn ved henting.") : "";

  function setDepositPaid(val) {
    setForm((f) => ({ ...f, depositPaid: val, depositPaidDate: val && !f.depositPaidDate ? todayISO() : f.depositPaidDate }));
  }
  function setDepositReturned(val) {
    setForm((f) => ({
      ...f, depositReturned: val,
      depositReturnedDate: val && !f.depositReturnedDate ? todayISO() : f.depositReturnedDate,
      depositReturnedAmount: val && !f.depositReturnedAmount ? f.deposit || "0" : f.depositReturnedAmount,
    }));
  }

  async function pickDamageImage() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert("Mangler tilgang", "Trenger tilgang til bilder for å legge til skadefoto."); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.5, base64: true });
    if (result.canceled) return;
    const asset = result.assets && result.assets[0];
    if (!asset || !asset.base64) return;
    const dataUrl = `data:image/jpeg;base64,${asset.base64}`;
    setForm((f) => ({ ...f, damageImages: [...f.damageImages, { name: asset.fileName || "skade.jpg", dataUrl }] }));
  }
  function removeDamageImage(i) {
    setForm((f) => ({ ...f, damageImages: f.damageImages.filter((_, idx) => idx !== i) }));
  }

  function save() {
    if (!form.vehicleId) { Alert.alert("Mangler bil", "Du må legge til en bil først (under 'Biler')."); return; }
    if (!form.customerId) { Alert.alert("Mangler kunde", "Du må legge til en kunde først (under 'Kunder')."); return; }
    if (!form.startDate || !form.endDate || form.endDate <= form.startDate) { Alert.alert("Ugyldige datoer", "Returdato må være etter hentedato."); return; }
    const id = booking ? booking.id : uid();
    const data = {
      id, vehicleId: form.vehicleId, customerId: form.customerId,
      startDate: form.startDate, endDate: form.endDate,
      totalPrice: Number(form.totalPrice) || 0, deposit: Number(form.deposit) || 0,
      status: form.status, notes: form.notes,
      depositPaid: form.depositPaid, depositPaidDate: form.depositPaidDate || "",
      depositReturned: form.depositReturned, depositReturnedDate: form.depositReturnedDate || "",
      depositReturnedAmount: form.depositReturnedAmount !== "" ? Number(form.depositReturnedAmount) : undefined,
      depositNotes: form.depositNotes,
      rentPaid: form.rentPaid,
      kmStart: form.kmStart !== "" ? Number(form.kmStart) : undefined,
      kmEnd: form.kmEnd !== "" ? Number(form.kmEnd) : undefined,
      damageNotes: form.damageNotes,
      damageImages: form.damageImages,
      createdAt: booking ? booking.createdAt : new Date().toISOString(),
    };
    const bookings = booking ? db.bookings.map((b) => (b.id === id ? data : b)) : [...db.bookings, data];
    commitDb({ ...db, bookings });
    onClose();
  }

  function remove() {
    Alert.alert("Slette bookingen?", "Dette kan ikke angres.", [
      { text: "Avbryt", style: "cancel" },
      { text: "Slett", style: "destructive", onPress: () => { commitDb({ ...db, bookings: db.bookings.filter((b) => b.id !== booking.id) }); onClose(); } },
    ]);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>{isNew ? "Ny booking" : "Rediger booking"}</Text>
          <TouchableOpacity onPress={onClose}><Text style={styles.closeText}>Lukk</Text></TouchableOpacity>
        </View>
        <ScrollView style={styles.modalBody} contentContainerStyle={{ paddingBottom: 60 }}>
          <FormField label="Bil"><VehiclePicker db={db} value={form.vehicleId} onChange={(id) => setForm({ ...form, vehicleId: id })} /></FormField>
          <FormField label="Kunde">
            {db.customers.length === 0 ? <Text style={styles.mutedText}>Ingen kunder — legg til en kunde først.</Text> : (
              <ChipPicker options={db.customers.map((c) => c.name)} value={(db.customers.find((c) => c.id === form.customerId) || {}).name} onChange={(name) => setForm({ ...form, customerId: (db.customers.find((c) => c.name === name) || {}).id })} />
            )}
          </FormField>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <FormField label="Hentedato"><DateField value={form.startDate} onChange={(d) => setForm({ ...form, startDate: d, endDate: form.endDate && form.endDate <= d ? addDays(d, 1) : form.endDate })} /></FormField>
            </View>
            <View style={{ flex: 1 }}>
              <FormField label="Returdato"><DateField value={form.endDate} minDate={form.startDate ? addDays(form.startDate, 1) : undefined} onChange={(d) => setForm({ ...form, endDate: d })} /></FormField>
            </View>
          </View>

          {priceCalc ? (
            <Text style={styles.mutedText}>Forslag: {fmtKr(priceCalc.total)} for {priceCalc.nights} natt(netter) — {priceCalc.breakdown}</Text>
          ) : (
            <Text style={styles.mutedText}>Velg bil og gyldige datoer for prisforslag.</Text>
          )}
          {conflict && <Text style={styles.errorText}>⚠️ Denne bilen er allerede booket i deler av denne perioden.</Text>}

          <FormField label="Totalpris (kr)"><TextInput style={styles.input} value={form.totalPrice} onChangeText={(t) => setForm({ ...form, totalPrice: t, priceAuto: false })} keyboardType="numeric" placeholder="0" /></FormField>
          <FormField label="Depositum (kr)"><TextInput style={styles.input} value={form.deposit} onChangeText={(t) => setForm({ ...form, deposit: t })} keyboardType="numeric" placeholder="0" /></FormField>
          <FormField label="Status"><ChipPicker options={["bekreftet", "forespørsel", "avlyst"]} value={form.status} onChange={(s) => setForm({ ...form, status: s })} /></FormField>

          <View style={styles.checkRow}>
            <Switch value={form.rentPaid} onValueChange={(v) => setForm({ ...form, rentPaid: v })} />
            <Text style={styles.fieldLabel}>Leie betalt</Text>
          </View>
          <View style={styles.checkRow}>
            <Switch value={form.depositPaid} onValueChange={setDepositPaid} />
            <Text style={styles.fieldLabel}>Depositum innbetalt</Text>
          </View>
          {form.depositPaid && (
            <FormField label="Dato betalt"><DateField value={form.depositPaidDate} onChange={(d) => setForm({ ...form, depositPaidDate: d })} /></FormField>
          )}
          <View style={styles.checkRow}>
            <Switch value={form.depositReturned} onValueChange={setDepositReturned} />
            <Text style={styles.fieldLabel}>Depositum returnert</Text>
          </View>
          {form.depositReturned && (
            <>
              <FormField label="Dato returnert"><DateField value={form.depositReturnedDate} onChange={(d) => setForm({ ...form, depositReturnedDate: d })} /></FormField>
              <FormField label="Returnert beløp (kr)"><TextInput style={styles.input} value={form.depositReturnedAmount} onChangeText={(t) => setForm({ ...form, depositReturnedAmount: t })} keyboardType="numeric" placeholder="Hele depositumet" /></FormField>
              <FormField label="Notat depositum"><TextInput style={styles.input} value={form.depositNotes} onChangeText={(t) => setForm({ ...form, depositNotes: t })} placeholder="Valgfritt" /></FormField>
            </>
          )}

          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <FormField label="Km ved henting"><TextInput style={styles.input} value={form.kmStart} onChangeText={(t) => setForm({ ...form, kmStart: t })} keyboardType="numeric" placeholder="0" /></FormField>
            </View>
            <View style={{ flex: 1 }}>
              <FormField label="Km ved levering"><TextInput style={styles.input} value={form.kmEnd} onChangeText={(t) => setForm({ ...form, kmEnd: t })} keyboardType="numeric" placeholder="0" /></FormField>
            </View>
          </View>
          {!!kmDrivenText && <Text style={styles.mutedText}>{kmDrivenText}</Text>}

          <FormField label="Skaderapport / notat ved retur"><TextInput style={[styles.input, { height: 70 }]} value={form.damageNotes} onChangeText={(t) => setForm({ ...form, damageNotes: t })} multiline placeholder="Ingen skader" /></FormField>

          <FormField label="Skadefoto">
            <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
              {form.damageImages.map((img, i) => (
                <View key={i} style={{ marginRight: 8, marginBottom: 8 }}>
                  <Image source={{ uri: img.dataUrl }} style={styles.damageThumb} />
                  <TouchableOpacity onPress={() => removeDamageImage(i)} style={styles.damageRemoveBtn}><Text style={{ color: "#fff", fontSize: 11 }}>✕</Text></TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity onPress={pickDamageImage} style={styles.addPhotoBtn}><Text style={{ fontSize: 24, color: "#64748b" }}>+</Text></TouchableOpacity>
            </View>
          </FormField>

          <FormField label="Notater"><TextInput style={[styles.input, { height: 70 }]} value={form.notes} onChangeText={(t) => setForm({ ...form, notes: t })} multiline placeholder="Valgfritt" /></FormField>

          <TouchableOpacity style={styles.primaryBtn} onPress={save}><Text style={styles.primaryBtnText}>Lagre</Text></TouchableOpacity>
          {!isNew && <TouchableOpacity style={styles.dangerBtn} onPress={remove}><Text style={styles.dangerBtnText}>Slett booking</Text></TouchableOpacity>}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
