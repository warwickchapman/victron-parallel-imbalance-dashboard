/*
=========================================================
Victron Parallel Inverter Load — % of Configured Maximum
Bar-graph data builder for FlowFuse Dashboard 2.0
Venus OS Node-RED Function
=========================================================

PURPOSE
-------
For each parallel VE.Bus inverter/charger unit, expresses its
current AC power as a percentage of a CONFIGURED maximum
(the inverter's rated continuous power). Groups the units by
phase so the dashboard can draw one coloured bar per unit.

Re-uses the same automatic discovery as the Parallel Balance
monitor:

  - VRM Portal ID
  - VE.Bus instance
  - Device numbers
  - Total units / phases / units-per-phase

No portal ID, phase count or unit count is entered by hand.


THE ONE THING YOU MUST SET
--------------------------
RATED_W_PER_UNIT below = the rated continuous output (in W)
of a SINGLE inverter unit. The bar percentage is:

    percentage = |unit power| / rated_per_unit * 100

If the parallel bank mixes different models, list the odd
ones out in RATED_W_OVERRIDES keyed by VE.Bus device number.


MQTT INPUT
----------
Subscribe (auto instance):

    N/+/vebus/+/Devices/+/Ac/+/P

Topics seen:

    N/<portal>/vebus/<instance>/Devices/<device>/Ac/In/P
    N/<portal>/vebus/<instance>/Devices/<device>/Ac/Out/P

Payload: {"value":1234}  or  1234


TIMER INPUT
-----------
An inject sending topic "load-percent-tick" (every ~30 s)
lets the node re-flag stale readings and refresh the bars
even when no new MQTT value has arrived.
=========================================================
*/


// =====================================================
// SETTINGS  ——  edit these
// =====================================================

// Rated continuous output of ONE inverter unit, in watts.
// 0 = AUTO-DETECT: the highest per-unit power ever seen is
// rounded UP to the nearest standard inverter class (list
// below), which recovers the nameplate rating on its own.
// Set an explicit value (e.g. 20000) to force exact figures.
const RATED_W_PER_UNIT = 0;

// Per-device rated overrides for mixed banks, keyed by
// VE.Bus device number. Example: { 0: 8000, 1: 8000 }
const RATED_W_OVERRIDES = {};

// Standard inverter classes (W) used by auto-detect.
const RATING_CLASSES = [
    800, 1200, 1600, 2000, 2400, 3000, 4000, 5000,
    8000, 10000, 12000, 15000, 20000, 24000
];

// Which side(s) to show:  "out" | "in" | "both"
const DIRECTION_MODE = "both";

// Phase bar colours. Currently Amped dark theme: L1 amber, L2 green, L3 blue.
// (For the old Zim/UK code use L1 #e53935, L2 #f9a825, L3 #1e88e5.)
const PHASE_COLOURS = {
    L1: "#f5a623",
    L2: "#34d399",
    L3: "#3b9eff"
};

// Percentage thresholds for emphasis on a bar.
const WARN_PCT = 80;
const HIGH_PCT = 100;

// Ignore balance below this average phase load (noisy at low load).
const MIN_BALANCE_W = 100;

// Bar colour mode: "severity" = heat gradient showing how hard each
// unit works vs its phase peers (hardest = red); "phase" = solid
// phase colour. Phase identity always stays on the badge and arc.
const BAR_COLOUR_MODE = "severity";

// A phase spread (highest-lowest)/average of this fraction is treated
// as "fully severe" (top unit fully red). 0.25 = 25% spread.
const SPREAD_FULL_RATIO = 0.25;

// ---- alert thresholds ----
// Current-sharing balance (lowest/highest %) below these raises an alert.
const BAL_WARN_PCT = 85;   // amber below this
const BAL_CRIT_PCT = 78;   // red below this
// AC output voltage imbalance (spread/average %) above these raises an alert.
const VOLT_WARN_PCT = 2.0; // amber above this
const VOLT_CRIT_PCT = 4.0; // red above this
// Per-unit AC-output voltage deviation from the phase's unit average (volts).
// Flags a single unit reading differently from its siblings — e.g. a loose /
// high-resistance connection that needs retorquing.
const UNIT_V_WARN = 1.5;   // amber beyond this
const UNIT_V_CRIT = 3.0;   // red beyond this


// =====================================================
// SETTINGS  ——  usually leave alone
// =====================================================

const STALE_MS = 90 * 1000;
const DEVICE_REMOVE_MS = 10 * 60 * 1000;

// "auto" | "single" | "three"
const AUTO_PHASE_MODE = "auto";
const REQUIRE_CONTIGUOUS_DEVICES = true;

const DEBUG = false;


// =====================================================
// HELPERS
// =====================================================

function debug(m) {
    if (DEBUG) { node.warn(m); }
}

// Filled in once the peak is known (auto) or from the setting.
let RATING_DEFAULT = RATED_W_PER_UNIT;

function ratedFor(device) {
    const override = RATED_W_OVERRIDES[device];
    if (Number.isFinite(Number(override)) && Number(override) > 0) {
        return Number(override);
    }
    return RATING_DEFAULT > 0 ? RATING_DEFAULT : 0;
}

// Round an observed peak up to the nearest standard class.
function ratingClassFor(peak) {
    for (let i = 0; i < RATING_CLASSES.length; i++) {
        if (RATING_CLASSES[i] >= peak * 1.05) { return RATING_CLASSES[i]; }
    }
    return Math.max(
        RATING_CLASSES[RATING_CLASSES.length - 1],
        Math.ceil(peak / 1000) * 1000
    );
}

function formatWatts(value) {
    if (value === null || value === undefined) { return "--"; }
    const w = Math.round(value);
    if (Math.abs(w) >= 1000) {
        return (w / 1000).toFixed(1) + " kW";
    }
    return w + " W";
}

// Heat ramp green -> yellow -> orange -> red for imbalance severity.
const HEAT_STOPS = [
    [0.00, [46, 199, 113]],
    [0.45, [244, 197, 66]],
    [0.72, [239, 140, 59]],
    [1.00, [245, 67, 59]]
];

function heatColour(t) {
    t = Math.max(0, Math.min(1, t));
    for (let i = 1; i < HEAT_STOPS.length; i++) {
        if (t <= HEAT_STOPS[i][0]) {
            const p0 = HEAT_STOPS[i - 1][0], c0 = HEAT_STOPS[i - 1][1];
            const p1 = HEAT_STOPS[i][0], c1 = HEAT_STOPS[i][1];
            const f = (t - p0) / ((p1 - p0) || 1);
            const ch = k => Math.round(c0[k] + (c1[k] - c0[k]) * f)
                .toString(16).padStart(2, "0");
            return "#" + ch(0) + ch(1) + ch(2);
        }
    }
    return "#f5433b";
}


// =====================================================
// TIME / STATE
// =====================================================

const now = Date.now();
const isTick = msg.topic === "load-percent-tick";

let state = context.get("loadPercentState") || {
    readings: { In: {}, Out: {} },
    devices: {},
    portalId: null,
    vebusInstance: null,
    peakMagnitude: 0,
    acOutV: {},
    devVOut: {}
};

if (!state.readings) { state.readings = { In: {}, Out: {} }; }
if (!state.readings.In) { state.readings.In = {}; }
if (!state.readings.Out) { state.readings.Out = {}; }
if (!state.devices) { state.devices = {}; }
if (!Number.isFinite(state.peakMagnitude)) { state.peakMagnitude = 0; }
if (!state.acOutV) { state.acOutV = {}; }
if (!state.devVOut) { state.devVOut = {}; }


// =====================================================
// READ MQTT
// =====================================================

if (!isTick) {

    const topic = String(msg.topic || "");

    const mP = topic.match(
        /^N\/([^/]+)\/vebus\/(\d+)\/Devices\/(\d+)\/Ac\/(In|Out)\/P$/
    );
    const mDV = topic.match(
        /^N\/([^/]+)\/vebus\/(\d+)\/Devices\/(\d+)\/Ac\/(In|Out)\/V$/
    );
    const mV = topic.match(
        /^N\/([^/]+)\/vebus\/(\d+)\/Ac\/Out\/(L1|L2|L3)\/V$/
    );

    const matched = mP || mDV || mV;

    if (!matched) {
        node.status({ fill: "yellow", shape: "ring", text: "Unexpected MQTT topic" });
        return null;
    }

    const portalId = matched[1];
    const vebusInstance = Number(matched[2]);

    // Extract a numeric value from { value: x } or a bare number.
    let raw = msg.payload;
    if (raw !== null && typeof raw === "object" &&
        Object.prototype.hasOwnProperty.call(raw, "value")) {
        raw = raw.value;
    }
    const value = Number(raw);

    // Different VE.Bus system -> reset discovery
    const systemChanged =
        state.portalId !== null &&
        (state.portalId !== portalId || state.vebusInstance !== vebusInstance);

    if (systemChanged) {
        state = {
            readings: { In: {}, Out: {} },
            devices: {},
            portalId,
            vebusInstance,
            peakMagnitude: 0,
            acOutV: {},
            devVOut: {}
        };
    }

    state.portalId = portalId;
    state.vebusInstance = vebusInstance;

    if (mP) {
        const device = Number(mP[3]);
        const direction = mP[4];

        if (!Number.isInteger(device) || device < 0 ||
            !Number.isInteger(vebusInstance) || !Number.isFinite(value)) {
            node.status({ fill: "red", shape: "ring", text: "Invalid device or power value" });
            return null;
        }

        if (!state.devices[device]) {
            state.devices[device] = { firstSeen: now, lastSeen: now };
            debug("Discovered VE.Bus device " + device);
        } else {
            state.devices[device].lastSeen = now;
        }

        state.readings[direction][device] = { value, timestamp: now };

        const mag = Math.abs(value);
        if (Number.isFinite(mag)) {
            state.peakMagnitude = Math.max(state.peakMagnitude || 0, mag);
        }
    } else if (mV) {
        // AC output voltage per phase
        if (Number.isFinite(value)) {
            state.acOutV[mV[3]] = { value, timestamp: now };
        }
    } else if (mDV) {
        // Per-device AC output voltage (if published by this system)
        if (mDV[4] === "Out" && Number.isFinite(value)) {
            state.devVOut[Number(mDV[3])] = { value, timestamp: now };
        }
    }
}


// =====================================================
// REMOVE DISAPPEARED DEVICES
// =====================================================

if (DEVICE_REMOVE_MS > 0) {
    Object.keys(state.devices).forEach(key => {
        const dev = Number(key);
        if (now - state.devices[dev].lastSeen > DEVICE_REMOVE_MS) {
            delete state.devices[dev];
            delete state.readings.In[dev];
            delete state.readings.Out[dev];
        }
    });
}


// =====================================================
// DEVICE LIST
// =====================================================

const deviceNumbers = Object.keys(state.devices)
    .map(Number)
    .filter(Number.isInteger)
    .sort((a, b) => a - b);

const totalUnits = deviceNumbers.length;

if (totalUnits === 0) {
    context.set("loadPercentState", state);
    node.status({ fill: "grey", shape: "ring", text: "Waiting for VE.Bus MQTT data" });
    return null;
}


// =====================================================
// PHASE DETECTION  (same rules as balance monitor)
// =====================================================

const startsAtZero = deviceNumbers[0] === 0;
const contiguous = deviceNumbers.every((dev, i) => dev === i);
const containsFirstThree =
    deviceNumbers.includes(0) &&
    deviceNumbers.includes(1) &&
    deviceNumbers.includes(2);

let phases = 1;

if (AUTO_PHASE_MODE === "three") {
    phases = 3;
} else if (AUTO_PHASE_MODE === "single") {
    phases = 1;
} else {
    const numberingOK = !REQUIRE_CONTIGUOUS_DEVICES || (startsAtZero && contiguous);
    if (totalUnits >= 3 && totalUnits % 3 === 0 && containsFirstThree && numberingOK) {
        phases = 3;
    }
}

if (totalUnits % phases !== 0) {
    context.set("loadPercentState", state);
    node.status({
        fill: "red", shape: "ring",
        text: totalUnits + " units cannot split over " + phases + " phases"
    });
    return null;
}

const unitsPerPhase = totalUnits / phases;

// Resolve the per-unit rating: explicit setting wins, else auto.
const autoRating = ratingClassFor(state.peakMagnitude || 0);
if (!(RATED_W_PER_UNIT > 0)) { RATING_DEFAULT = autoRating; }

// Phase AC-output bus voltage, used as the per-unit voltage when no
// per-device voltage is published (paralleled units share the bus).
function vFreshR(r) { return r && (now - r.timestamp <= STALE_MS); }
const phaseVolt = {};
(phases === 3 ? ["L1", "L2", "L3"] : ["L1"]).forEach(ph => {
    const r = state.acOutV[ph];
    phaseVolt[ph] = vFreshR(r) ? r.value : null;
});


// =====================================================
// BUILD ONE DIRECTION
// =====================================================

function phaseNames() {
    return phases === 3 ? ["L1", "L2", "L3"] : ["L1"];
}

function devicesForPhase(phaseIndex) {
    if (phases === 1) { return [...deviceNumbers]; }
    return deviceNumbers.filter(dev => dev % phases === phaseIndex);
}

function buildDirection(dirKey, dirLabel) {

    const rows = phaseNames().map((phase, phaseIndex) => {

        const phaseDevices = devicesForPhase(phaseIndex);

        let capacityW = 0;
        let totalW = 0;
        let liveUnits = 0;

        const units = phaseDevices.map((device, i) => {

            const rated = ratedFor(device);
            capacityW += rated;

            const reading = state.readings[dirKey][device];
            const stale = !reading || (now - reading.timestamp > STALE_MS);

            const watts = reading ? reading.value : null;
            const magnitude = watts === null ? null : Math.abs(watts);

            let pct = null;
            if (!stale && magnitude !== null && rated > 0) {
                pct = magnitude / rated * 100;
                totalW += magnitude;
                liveUnits += 1;
            }

            let level = "unknown";
            if (stale) {
                level = "stale";
            } else if (pct !== null) {
                if (pct >= HIGH_PCT) { level = "high"; }
                else if (pct >= WARN_PCT) { level = "warn"; }
                else { level = "ok"; }
            }

            // per-unit AC output voltage (per-device if present, else phase bus)
            const dv = state.devVOut[device];
            const dvFresh = dv && (now - dv.timestamp <= STALE_MS);
            const voltage = dvFresh
                ? dv.value
                : (phaseVolt[phase] != null ? phaseVolt[phase] : null);
            const voltageSource = dvFresh ? "unit" : (phaseVolt[phase] != null ? "phase" : "none");

            return {
                unit: i + 1,
                device,
                watts,
                rated,
                pct,
                stale,
                level,
                voltage,
                voltageSource,
                voltageText: voltage === null ? "--" : voltage.toFixed(1) + " V",
                pctText: pct === null ? "--" : Math.round(pct) + "%",
                wattsText: formatWatts(magnitude),
                ratedText: formatWatts(rated)
            };
        });

        const totalPct = capacityW > 0 && liveUnits > 0
            ? totalW / capacityW * 100
            : null;

        // ---- shared phase statistics ----
        const liveMags = units
            .filter(u => u.pct !== null)
            .map(u => Math.abs(u.watts));

        let lo = null, hi = null, avg = null;
        if (liveMags.length) {
            lo = Math.min(...liveMags);
            hi = Math.max(...liveMags);
            avg = liveMags.reduce((a, b) => a + b, 0) / liveMags.length;
        }

        // ---- imbalance heat colour per unit ----
        // Rank within the phase (green = lightest .. red = hardest),
        // scaled by how big the imbalance actually is, so a balanced
        // phase stays calm/green and only real imbalance lights up.
        const spreadRatio = (avg && avg > 0 && hi > lo) ? (hi - lo) / avg : 0;
        const heatScale = Math.max(0, Math.min(1, spreadRatio / SPREAD_FULL_RATIO));

        let hardestDevice = null, hardestMag = -1;
        units.forEach(u => {
            let t = 0;
            if (u.pct !== null && hi > lo) {
                t = (Math.abs(u.watts) - lo) / (hi - lo) * heatScale;
            }
            u.severityT = t;
            u.heatColour = heatColour(t);
            u.barColour = u.stale
                ? "#3a4556"
                : (BAR_COLOUR_MODE === "phase"
                    ? (PHASE_COLOURS[phase] || "#607d8b")
                    : u.heatColour);
            if (u.pct !== null && Math.abs(u.watts) > hardestMag) {
                hardestMag = Math.abs(u.watts);
                hardestDevice = u.device;
            }
        });
        units.forEach(u => {
            u.hardest = u.device === hardestDevice && spreadRatio > 0.02;
        });

        // ---- per-unit output-voltage deviation (loose-connection check) ----
        // Only meaningful when real per-device voltages exist; if units fall
        // back to the shared phase voltage they are equal and nothing flags.
        const unitVs = units
            .filter(u => u.voltageSource === "unit" && u.voltage !== null)
            .map(u => u.voltage);
        const unitVMean = unitVs.length >= 2
            ? unitVs.reduce((a, b) => a + b, 0) / unitVs.length
            : null;

        units.forEach(u => {
            u.vDev = null;
            u.vLevel = "ok";
            u.vDevText = "";
            if (u.voltageSource === "unit" && u.voltage !== null && unitVMean !== null) {
                u.vDev = u.voltage - unitVMean;
                const ad = Math.abs(u.vDev);
                if (ad >= UNIT_V_CRIT) { u.vLevel = "critical"; }
                else if (ad >= UNIT_V_WARN) { u.vLevel = "warning"; }
                u.vDevText = (u.vDev >= 0 ? "+" : "") + u.vDev.toFixed(1) + " V";
            }
        });

        // ---- current-sharing balance (as in the old tables) ----
        // Balance = lowest / highest.  Bracket = spread / average.
        let balance = null;
        let balanceImb = null;
        let balanceLevel = "unknown";
        let balanceText = "--";

        if (liveMags.length >= 2) {
            if (avg >= MIN_BALANCE_W && hi > 0) {
                balance = lo / hi * 100;
                balanceImb = (hi - lo) / avg * 100;
                balanceText = balance.toFixed(0) + "% (" + balanceImb.toFixed(0) + "%)";
                balanceLevel =
                    balance >= 95 ? "excellent" :
                    balance >= 90 ? "good" :
                    balance >= 80 ? "warning" :
                    balance >= 70 ? "poor" : "bad";
            } else {
                balanceLevel = "low-load";
                balanceText = "low load";
            }
        } else if (liveMags.length === 1) {
            balanceLevel = "single";
            balanceText = "1 unit";
        }

        return {
            phase,
            colour: PHASE_COLOURS[phase] || "#607d8b",
            unitCount: phaseDevices.length,
            liveUnits,
            capacityW,
            totalW,
            totalPct,
            balance,
            balanceImb,
            balanceLevel,
            balanceText,
            capacityText: formatWatts(capacityW),
            totalText: formatWatts(totalW),
            totalPctText: totalPct === null ? "--" : Math.round(totalPct) + "%",
            units
        };
    });

    return { key: dirKey, label: dirLabel, phases: rows };
}


// =====================================================
// ASSEMBLE SECTIONS
// =====================================================

const sections = [];
if (DIRECTION_MODE === "out" || DIRECTION_MODE === "both") {
    sections.push(buildDirection("Out", "AC Output Load"));
}
if (DIRECTION_MODE === "in" || DIRECTION_MODE === "both") {
    sections.push(buildDirection("In", "AC Input Load"));
}

// Highest percentage anywhere, for a shared bar scale.
let maxPct = 0;
sections.forEach(section => {
    section.phases.forEach(row => {
        row.units.forEach(u => {
            if (u.pct !== null) { maxPct = Math.max(maxPct, u.pct); }
        });
    });
});


// =====================================================
// STATUS
// =====================================================

let staleCount = 0;
sections.forEach(section => {
    section.phases.forEach(row => {
        row.units.forEach(u => { if (u.stale) { staleCount += 1; } });
    });
});

if (staleCount > 0) {
    node.status({
        fill: "yellow", shape: "ring",
        text: phases + "\u03c6 \u00b7 " + totalUnits + " units \u00b7 " + staleCount + " stale"
    });
} else {
    node.status({
        fill: "green", shape: "dot",
        text: phases + "\u03c6 \u00b7 " + totalUnits + " units \u00b7 all current"
    });
}


// =====================================================
// OUTPUT
// =====================================================

// =====================================================
// VOLTAGES
// =====================================================

function vStale(reading) {
    return !reading || (now - reading.timestamp > STALE_MS);
}

function fmtVolts(v) {
    return v === null ? "--" : v.toFixed(1) + " V";
}

const phaseOrder = phases === 3 ? ["L1", "L2", "L3"] : ["L1"];

// Average of each phase's per-unit output voltages (from the sections).
const phaseUnitV = {};
const vsec0 = sections[0];
if (vsec0) {
    vsec0.phases.forEach(row => {
        const vs = row.units.filter(u => u.voltage !== null).map(u => u.voltage);
        phaseUnitV[row.phase] = vs.length
            ? vs.reduce((a, b) => a + b, 0) / vs.length
            : null;
    });
}

// Phase AC-output voltage: the bus topic if present, else the average
// of that phase's per-unit voltages.
const acOut = phaseOrder.map(ph => {
    const r = state.acOutV[ph];
    const value = vFreshR(r)
        ? r.value
        : (phaseUnitV[ph] != null ? phaseUnitV[ph] : null);
    const stale = value === null;
    return {
        phase: ph,
        value,
        stale,
        text: stale ? "--" : fmtVolts(value)
    };
});

// AC output voltage imbalance across phases
const vVals = acOut.filter(x => x.value !== null).map(x => x.value);
let vImbalance = null, vSpread = null, vAvg = null;
if (vVals.length >= 2) {
    const lo = Math.min(...vVals);
    const hi = Math.max(...vVals);
    vAvg = vVals.reduce((a, b) => a + b, 0) / vVals.length;
    vSpread = hi - lo;
    vImbalance = vAvg > 0 ? vSpread / vAvg * 100 : null;
}

let vLevel = "ok";
if (vImbalance !== null) {
    if (vImbalance >= VOLT_CRIT_PCT) { vLevel = "critical"; }
    else if (vImbalance >= VOLT_WARN_PCT) { vLevel = "warning"; }
}

// mark phases furthest from the average
acOut.forEach(p => {
    p.deviation = (p.value !== null && vAvg) ? p.value - vAvg : null;
    p.outlier = vLevel !== "ok" && p.deviation !== null &&
        Math.abs(p.deviation) >= (vSpread / 2) * 0.9;
});


// =====================================================
// ALERTS
// =====================================================

const alerts = [];

// current-sharing imbalance (per direction, per phase)
sections.forEach(section => {
    section.phases.forEach(row => {
        if (row.balance !== null) {
            if (row.balance < BAL_CRIT_PCT) {
                alerts.push({
                    level: "critical",
                    text: section.label + " " + row.phase +
                        " sharing " + row.balanceText
                });
            } else if (row.balance < BAL_WARN_PCT) {
                alerts.push({
                    level: "warning",
                    text: section.label + " " + row.phase +
                        " sharing " + row.balanceText
                });
            }
        }
    });
});

// AC output voltage imbalance
if (vLevel !== "ok") {
    alerts.push({
        level: vLevel,
        text: "AC output voltage imbalance " + vImbalance.toFixed(1) +
            "% (" + acOut.map(p => p.phase + " " + p.text).join(", ") + ")"
    });
}

// per-unit voltage deviation (loose-connection indicator) — first section only
if (sections[0]) {
    sections[0].phases.forEach(row => {
        row.units.forEach(u => {
            if (u.vLevel && u.vLevel !== "ok") {
                alerts.push({
                    level: u.vLevel,
                    text: row.phase + " U" + u.unit + " output " + u.voltageText +
                        " (" + u.vDevText + " vs phase) — check connection / retorque"
                });
            }
        });
    });
}

const alertLevel = alerts.some(a => a.level === "critical")
    ? "critical"
    : (alerts.length ? "warning" : "ok");


// =====================================================
// OUTPUT
// =====================================================

msg.topic = "inverter_load_percent";

msg.payload = {
    detected: {
        portalId: state.portalId,
        vebusInstance: state.vebusInstance,
        phases,
        totalUnits,
        unitsPerPhase,
        deviceNumbers,
        ratedPerUnit: RATING_DEFAULT,
        ratingAuto: !(RATED_W_PER_UNIT > 0)
    },
    config: {
        ratedPerUnitDefault: RATED_W_PER_UNIT,
        directionMode: DIRECTION_MODE,
        warnPct: WARN_PCT,
        highPct: HIGH_PCT,
        phaseColours: PHASE_COLOURS
    },
    voltages: {
        acOut,
        imbalancePct: vImbalance,
        imbalanceText: vImbalance === null ? "--" : vImbalance.toFixed(1) + "%",
        spread: vSpread,
        level: vLevel
    },
    alerts,
    alertLevel,
    sections,
    maxPct,
    updated: new Date(now).toLocaleString("en-GB", { hour12: false })
};

context.set("loadPercentState", state);

return msg;
