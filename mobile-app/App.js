/*
 * Bobil Booking — iOS/Android-app (Expo)
 * ---------------------------------------
 * Viser ledige bobiler fra Supabase (samme database som nettsiden
 * bestilling.html) og lar kunder sende en bestillingsforespørsel.
 *
 * SLIK KJØRER DU DENNE APPEN (ingen Mac / Xcode nødvendig):
 *   1. Gå til https://snack.expo.dev i en nettleser
 *   2. Slett standardinnholdet i App.js og lim inn HELE denne filen
 *   3. Snack ser automatisk at du bruker "@supabase/supabase-js" og
 *      legger den til som avhengighet (bekreft evt. popup som dukker opp)
 *   4. Last ned "Expo Go" (gratis) fra App Store på iPhonen din
 *   5. Skann QR-koden i Snack med Expo Go (eller med iPhone-kameraet)
 *   6. Appen åpner seg direkte på telefonen og henter live data
 *
 * Samme Supabase-nøkler som i bestilling.html er brukt under.
 */

import React, { useEffect, useMemo, useState, useCallback } from "react";
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
  RefreshControl,
} from "react-native";
import { createClient } from "@supabase/supabase-js";

/* ===================== OPPSETT ===================== */
const SUPABASE_URL = "https://kydkjszbgdgvvkiicftg.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_maTxWGDwgcVBnpaCLNKGFA_UmrrPGLx";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

/* ===================== DATO-HJELPERE =====================
 * NB: Bruker LOKALE dato-komponenter (ikke toISOString/UTC).
 * Web-versjonen (bestilling.html) hadde en bug her som frøs siden
 * for brukere i tidssoner øst for UTC (som Norge) — fikset her fra start.
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
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("nb-NO", { day: "2-digit", month: "2-digit", year: "numeric" });
}
function fmtKr(n) {
  return Math.round(n || 0).toLocaleString("nb-NO") + " kr";
}
const WEEKDAYS = ["Man", "Tir", "Ons", "Tor", "Fre", "Lør", "Søn"];

/* ===================== APP ===================== */
export default function App() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [vehicles, setVehicles] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [errorMsg, setErrorMsg] = useState("");
  const [selectedVehicle, setSelectedVehicle] = useState(null);

  const loadData = useCallback(async () => {
    setErrorMsg("");
    try {
      const [{ data: v, error: vErr }, { data: b, error: bErr }] = await Promise.all([
        supabase.from("public_vehicles").select("*").order("name"),
        supabase.from("public_bookings").select("*"),
      ]);
      if (vErr) throw vErr;
      if (bErr) throw bErr;
      setVehicles(v || []);
      setBookings(b || []);
    } catch (e) {
      console.error(e);
      setErrorMsg("Kunne ikke hente data. Sjekk internettforbindelsen og prøv igjen.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const blockedForVehicle = useMemo(() => {
    const map = {};
    bookings.forEach((b) => {
      if (!map[b.vehicle_id]) map[b.vehicle_id] = [];
      map[b.vehicle_id].push(b);
    });
    return map;
  }, [bookings]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#3b82f6" />
          <Text style={styles.mutedText}>Henter bobiler …</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>🚐 Bobil Booking</Text>
        <Text style={styles.headerSubtitle}>Velg bobil, se ledige datoer og send en forespørsel</Text>
      </View>

      {errorMsg ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{errorMsg}</Text>
          <TouchableOpacity onPress={loadData} style={styles.retryBtn}>
            <Text style={styles.retryBtnText}>Prøv igjen</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <FlatList
        data={vehicles}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          !errorMsg ? (
            <View style={styles.center}>
              <Text style={{ fontSize: 40 }}>🚐</Text>
              <Text style={styles.mutedText}>Ingen bobiler er tilgjengelige for bestilling akkurat nå.</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <VehicleCard
            vehicle={item}
            onPress={() => setSelectedVehicle(item)}
          />
        )}
      />

      <Modal
        visible={!!selectedVehicle}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSelectedVehicle(null)}
      >
        {selectedVehicle ? (
          <BookingScreen
            vehicle={selectedVehicle}
            blockedDates={blockedForVehicle[selectedVehicle.id] || []}
            onClose={() => setSelectedVehicle(null)}
            onSubmitted={loadData}
          />
        ) : null}
      </Modal>
    </SafeAreaView>
  );
}

/* ===================== BIL-KORT ===================== */
function VehicleCard({ vehicle, onPress }) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.colorDot, { backgroundColor: vehicle.color || "#3b82f6" }]} />
      <View style={{ flex: 1 }}>
        <Text style={styles.cardTitle}>{vehicle.name}</Text>
        {vehicle.regnr ? <Text style={styles.cardSubtitle}>{vehicle.regnr}</Text> : null}
        <View style={styles.priceRow}>
          <Text style={styles.priceText}>{fmtKr(vehicle.daily_rate)} / natt</Text>
          {vehicle.weekend_rate ? (
            <Text style={styles.priceMuted}>Helg: {fmtKr(vehicle.weekend_rate)}</Text>
          ) : null}
        </View>
      </View>
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
  );
}

/* ===================== BESTILLINGS-SKJERM (kalender + skjema) ===================== */
function BookingScreen({ vehicle, blockedDates, onClose, onSubmitted }) {
  const [viewMonth, setViewMonth] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });
  const [start, setStart] = useState(null);
  const [end, setEnd] = useState(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState("");

  const isBlocked = useCallback(
    (dateISO) => blockedDates.some((b) => dateISO >= b.start_date && dateISO < b.end_date),
    [blockedDates]
  );

  const isPast = useCallback((dateISO) => dateISO < todayISO(), []);

  function onDayPress(dateISO) {
    if (isBlocked(dateISO) || isPast(dateISO)) return;
    if (!start || (start && end)) {
      setStart(dateISO);
      setEnd(null);
    } else if (dateISO <= start) {
      setStart(dateISO);
      setEnd(null);
    } else {
      // sjekk at ingen dag i intervallet er blokkert
      let d = start;
      let ok = true;
      while (d < dateISO) {
        if (isBlocked(d)) { ok = false; break; }
        d = addDays(d, 1);
      }
      if (!ok) {
        Alert.alert("Opptatt periode", "Perioden du valgte overlapper med en opptatt dato. Velg på nytt.");
        setStart(dateISO);
        setEnd(null);
        return;
      }
      setEnd(dateISO);
    }
  }

  async function submitRequest() {
    setFormError("");
    if (!start || !end) return setFormError("Velg fra- og til-dato i kalenderen.");
    if (!name.trim()) return setFormError("Fyll inn navn.");
    if (!email.trim() || !email.includes("@")) return setFormError("Fyll inn gyldig e-postadresse.");

    // dobbeltsjekk ledighet rett før innsending
    let d = start;
    while (d < end) {
      if (isBlocked(d)) return setFormError(`${fmtDate(d)} er allerede opptatt. Velg andre datoer.`);
      d = addDays(d, 1);
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.from("booking_requests").insert({
        vehicle_id: vehicle.id,
        vehicle_name: vehicle.name,
        customer_name: name.trim(),
        customer_email: email.trim(),
        customer_phone: phone.trim(),
        start_date: start,
        end_date: end,
        message: message.trim(),
        status: "pending",
      });
      if (error) throw error;
      setSubmitted(true);
    } catch (e) {
      console.error(e);
      setFormError("Kunne ikke sende forespørselen. Sjekk internettforbindelsen og prøv igjen.");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={{ fontSize: 48 }}>✅</Text>
          <Text style={styles.cardTitle}>Forespørsel sendt!</Text>
          <Text style={[styles.mutedText, { textAlign: "center", marginTop: 8 }]}>
            Vi bekrefter bookingen din så raskt vi kan, per e-post eller telefon.
          </Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={onClose}>
            <Text style={styles.primaryBtnText}>Lukk</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.modalHeader}>
        <Text style={styles.cardTitle}>{vehicle.name}</Text>
        <TouchableOpacity onPress={onClose}>
          <Text style={styles.closeBtn}>Lukk</Text>
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
        <Text style={styles.priceText}>{fmtKr(vehicle.daily_rate)} / natt</Text>
        {vehicle.notes ? <Text style={styles.mutedText}>{vehicle.notes}</Text> : null}

        <CalendarGrid
          viewMonth={viewMonth}
          setViewMonth={setViewMonth}
          isBlocked={isBlocked}
          isPast={isPast}
          start={start}
          end={end}
          onDayPress={onDayPress}
        />

        <View style={styles.selectionBox}>
          <Text style={styles.selectionText}>
            {start && end
              ? `${fmtDate(start)} → ${fmtDate(end)}`
              : start
              ? `Fra ${fmtDate(start)} — velg til-dato`
              : "Trykk på en dato for å starte, deretter en til-dato"}
          </Text>
        </View>

        <Text style={styles.label}>Navn *</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Ola Nordmann" />

        <Text style={styles.label}>E-post *</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="ola@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
        />

        <Text style={styles.label}>Telefon</Text>
        <TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder="12345678" keyboardType="phone-pad" />

        <Text style={styles.label}>Melding</Text>
        <TextInput
          style={[styles.input, { height: 80, textAlignVertical: "top" }]}
          value={message}
          onChangeText={setMessage}
          placeholder="Valgfritt"
          multiline
        />

        {formError ? <Text style={styles.errorText}>{formError}</Text> : null}

        <TouchableOpacity
          style={[styles.primaryBtn, submitting && { opacity: 0.6 }]}
          onPress={submitRequest}
          disabled={submitting}
        >
          <Text style={styles.primaryBtnText}>{submitting ? "Sender …" : "Send forespørsel"}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

/* ===================== KALENDER-GRID ===================== */
function CalendarGrid({ viewMonth, setViewMonth, isBlocked, isPast, start, end, onDayPress }) {
  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const monthLabel = viewMonth.toLocaleDateString("nb-NO", { month: "long", year: "numeric" });
  const firstOfMonth = new Date(year, month, 1);
  const startWeekday = (firstOfMonth.getDay() + 6) % 7; // Man=0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = Math.ceil((startWeekday + daysInMonth) / 7) * 7;

  const cells = [];
  for (let i = 0; i < totalCells; i++) {
    const dayNum = i - startWeekday + 1;
    if (dayNum < 1 || dayNum > daysInMonth) {
      cells.push(null);
    } else {
      const dateObj = new Date(year, month, dayNum);
      cells.push(toISO(dateObj));
    }
  }

  function prevMonth() {
    const d = new Date(year, month - 1, 1);
    setViewMonth(d);
  }
  function nextMonth() {
    const d = new Date(year, month + 1, 1);
    setViewMonth(d);
  }

  return (
    <View style={styles.calendarBox}>
      <View style={styles.calNavRow}>
        <TouchableOpacity onPress={prevMonth} style={styles.calNavBtn}>
          <Text style={styles.calNavBtnText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.calMonthLabel}>{monthLabel}</Text>
        <TouchableOpacity onPress={nextMonth} style={styles.calNavBtn}>
          <Text style={styles.calNavBtnText}>›</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.calWeekRow}>
        {WEEKDAYS.map((w) => (
          <Text key={w} style={styles.calWeekday}>{w}</Text>
        ))}
      </View>
      <View style={styles.calGrid}>
        {cells.map((dateISO, idx) => {
          if (!dateISO) return <View key={idx} style={styles.calCell} />;
          const blocked = isBlocked(dateISO);
          const past = isPast(dateISO);
          const disabled = blocked || past;
          const inRange = start && end && dateISO >= start && dateISO <= end;
          const isStart = dateISO === start;
          const isEnd = dateISO === end;
          const dayNum = parseInt(dateISO.slice(8, 10), 10);
          return (
            <TouchableOpacity
              key={idx}
              style={[
                styles.calCell,
                disabled && styles.calCellDisabled,
                inRange && styles.calCellInRange,
                (isStart || isEnd) && styles.calCellSelected,
              ]}
              disabled={disabled}
              onPress={() => onDayPress(dateISO)}
            >
              <Text
                style={[
                  styles.calCellText,
                  disabled && styles.calCellTextDisabled,
                  (isStart || isEnd) && styles.calCellTextSelected,
                ]}
              >
                {dayNum}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={styles.calLegendRow}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: "#ef4444" }]} />
          <Text style={styles.legendText}>Opptatt</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: "#3b82f6" }]} />
          <Text style={styles.legendText}>Valgt</Text>
        </View>
      </View>
    </View>
  );
}

/* ===================== STILER ===================== */
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f8fafc", paddingTop: Platform.OS === "android" ? StatusBar.currentHeight : 0 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  headerTitle: { fontSize: 22, fontWeight: "700", color: "#0f172a" },
  headerSubtitle: { fontSize: 13, color: "#64748b", marginTop: 2 },
  mutedText: { color: "#64748b", marginTop: 8, textAlign: "center" },
  errorBox: { backgroundColor: "#fef2f2", marginHorizontal: 16, padding: 12, borderRadius: 10, marginBottom: 4 },
  errorText: { color: "#dc2626", fontSize: 13 },
  retryBtn: { marginTop: 8, alignSelf: "flex-start" },
  retryBtnText: { color: "#dc2626", fontWeight: "600" },
  card: {
    flexDirection: "row", alignItems: "center", backgroundColor: "#fff",
    borderRadius: 14, padding: 14, marginBottom: 12, shadowColor: "#000",
    shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  colorDot: { width: 12, height: 12, borderRadius: 6, marginRight: 12 },
  cardTitle: { fontSize: 17, fontWeight: "700", color: "#0f172a" },
  cardSubtitle: { fontSize: 13, color: "#94a3b8", marginTop: 2 },
  priceRow: { flexDirection: "row", gap: 10, marginTop: 6, alignItems: "center" },
  priceText: { fontSize: 15, fontWeight: "600", color: "#3b82f6", marginTop: 4 },
  priceMuted: { fontSize: 12, color: "#94a3b8" },
  chevron: { fontSize: 26, color: "#cbd5e1", marginLeft: 8 },
  modalHeader: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    padding: 16, borderBottomWidth: 1, borderBottomColor: "#e2e8f0",
  },
  closeBtn: { color: "#3b82f6", fontWeight: "600", fontSize: 15 },
  label: { fontSize: 13, fontWeight: "600", color: "#334155", marginTop: 14, marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 10, paddingHorizontal: 12,
    paddingVertical: 10, fontSize: 15, backgroundColor: "#fff",
  },
  selectionBox: { backgroundColor: "#eff6ff", borderRadius: 10, padding: 12, marginTop: 14, marginBottom: 4 },
  selectionText: { color: "#1d4ed8", fontSize: 13, fontWeight: "600", textAlign: "center" },
  primaryBtn: { backgroundColor: "#3b82f6", borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 18 },
  primaryBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  calendarBox: { backgroundColor: "#fff", borderRadius: 14, padding: 12, marginTop: 16 },
  calNavRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  calNavBtn: { padding: 8 },
  calNavBtnText: { fontSize: 20, color: "#3b82f6", fontWeight: "700" },
  calMonthLabel: { fontSize: 15, fontWeight: "700", color: "#0f172a", textTransform: "capitalize" },
  calWeekRow: { flexDirection: "row" },
  calWeekday: { flex: 1, textAlign: "center", fontSize: 11, color: "#94a3b8", fontWeight: "600" },
  calGrid: { flexDirection: "row", flexWrap: "wrap" },
  calCell: {
    width: `${100 / 7}%`, aspectRatio: 1, alignItems: "center", justifyContent: "center",
    marginVertical: 2,
  },
  calCellText: { fontSize: 14, color: "#0f172a" },
  calCellDisabled: { backgroundColor: "#fef2f2", borderRadius: 8 },
  calCellTextDisabled: { color: "#fca5a5", textDecorationLine: "line-through" },
  calCellInRange: { backgroundColor: "#dbeafe" },
  calCellSelected: { backgroundColor: "#3b82f6", borderRadius: 8 },
  calCellTextSelected: { color: "#fff", fontWeight: "700" },
  calLegendRow: { flexDirection: "row", justifyContent: "center", gap: 20, marginTop: 10 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 11, color: "#64748b" },
});
