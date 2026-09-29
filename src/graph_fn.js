/*
=========================================================
Victron Parallel VE.Bus Load History (rolling 60 minutes)
+ automatic per-unit rating detection for graph auto-range
Venus OS Node-RED Function
=========================================================
Input : N/+/vebus/+/Devices/+/Ac/+/P
Output: rolling per-unit In/Out history, plus a detected
        per-unit rating (ratedPerUnit) the dashboard uses
        to auto-scale every chart's Y-axis.
=========================================================
*/

// ---- settings ----
const STALE_MS = 90 * 1000;
const DEVICE_REMOVE_MS = 10 * 60 * 1000;
const AUTO_PHASE_MODE = "auto";              // "auto" | "single" | "three"
const REQUIRE_CONTIGUOUS_DEVICES = true;

const HISTORY_MS = 60 * 60 * 1000;           // 60-minute window
const HISTORY_SAMPLE_MS = 30 * 1000;         // sample every 30 s

// 0 = auto-detect rating from the observed peak (rounded up
// to the nearest standard class). Set e.g. 20000 to force it.
const RATED_W_PER_UNIT = 0;
const RATING_CLASSES = [
    800, 1200, 1600, 2000, 2400, 3000, 4000, 5000,
    8000, 10000, 12000, 15000, 20000, 24000
];

function ratingClassFor(peak) {
    for (let i = 0; i < RATING_CLASSES.length; i++) {
        if (RATING_CLASSES[i] >= peak * 1.05) { return RATING_CLASSES[i]; }
    }
    return Math.max(
        RATING_CLASSES[RATING_CLASSES.length - 1],
        Math.ceil(peak / 1000) * 1000
    );
}

const now = Date.now();

// ---- state ----
let state = context.get("parallelLoadHistory") || {
    readings: { In: {}, Out: {} },
    devices: {},
    portalId: null,
    vebusInstance: null,
    history: [],
    lastHistoryTimestamp: 0,
    peakMagnitude: 0
};
if (!state.readings) { state.readings = { In: {}, Out: {} }; }
if (!state.readings.In) { state.readings.In = {}; }
if (!state.readings.Out) { state.readings.Out = {}; }
if (!state.devices) { state.devices = {}; }
if (!Array.isArray(state.history)) { state.history = []; }
if (!Number.isFinite(state.lastHistoryTimestamp)) { state.lastHistoryTimestamp = 0; }
if (!Number.isFinite(state.peakMagnitude)) { state.peakMagnitude = 0; }

// ---- parse MQTT ----
const m = String(msg.topic || "").match(
    /^N\/([^/]+)\/vebus\/(\d+)\/Devices\/(\d+)\/Ac\/(In|Out)\/P$/
);
if (!m) {
    node.status({ fill: "yellow", shape: "ring", text: "Waiting for VE.Bus power data" });
    return null;
}

const portalId = m[1];
const vebusInstance = Number(m[2]);
const device = Number(m[3]);
const direction = m[4];

let value = msg.payload;
if (value !== null && typeof value === "object" &&
    Object.prototype.hasOwnProperty.call(value, "value")) {
    value = value.value;
}
value = Number(value);

if (!Number.isInteger(device) || device < 0 ||
    !Number.isInteger(vebusInstance) || !Number.isFinite(value)) {
    node.status({ fill: "red", shape: "ring", text: "Invalid VE.Bus power data" });
    return null;
}

// ---- system change ----
const systemChanged =
    state.portalId !== null &&
    (state.portalId !== portalId || state.vebusInstance !== vebusInstance);
if (systemChanged) {
    state = {
        readings: { In: {}, Out: {} },
        devices: {},
        portalId,
        vebusInstance,
        history: [],
        lastHistoryTimestamp: 0,
        peakMagnitude: 0
    };
}

state.portalId = portalId;
state.vebusInstance = vebusInstance;

if (!state.devices[device]) {
    state.devices[device] = { firstSeen: now, lastSeen: now };
} else {
    state.devices[device].lastSeen = now;
}

state.readings[direction][device] = { value, timestamp: now };

const mag = Math.abs(value);
if (Number.isFinite(mag)) {
    state.peakMagnitude = Math.max(state.peakMagnitude || 0, mag);
}

// ---- remove disappeared devices ----
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

// ---- device list ----
const deviceNumbers = Object.keys(state.devices)
    .map(Number).sort((a, b) => a - b);
const totalUnits = deviceNumbers.length;
if (totalUnits === 0) { return null; }

// ---- phase detection ----
const startsAtZero = deviceNumbers[0] === 0;
const contiguous = deviceNumbers.every((dev, i) => dev === i);
const containsFirstThree =
    deviceNumbers.includes(0) && deviceNumbers.includes(1) && deviceNumbers.includes(2);

let phases = 1;
if (AUTO_PHASE_MODE === "three") { phases = 3; }
else if (AUTO_PHASE_MODE === "single") { phases = 1; }
else {
    const numberingOK = !REQUIRE_CONTIGUOUS_DEVICES || (startsAtZero && contiguous);
    if (totalUnits >= 3 && totalUnits % 3 === 0 && containsFirstThree && numberingOK) {
        phases = 3;
    }
}

function phaseForDevice(dev) {
    if (phases === 1) { return "L1"; }
    const i = dev % 3;
    return i === 0 ? "L1" : (i === 1 ? "L2" : "L3");
}

// ---- trim history older than 60 min ----
const cutoff = now - HISTORY_MS;
state.history = state.history.filter(
    s => s && Number.isFinite(s.timestamp) && s.timestamp >= cutoff
);

// ---- record a sample every HISTORY_SAMPLE_MS ----
if (now - state.lastHistoryTimestamp >= HISTORY_SAMPLE_MS) {
    const sample = { timestamp: now, out: {}, in: {} };
    deviceNumbers.forEach(dev => {
        const o = state.readings.Out[dev];
        sample.out[dev] = (o && now - o.timestamp <= STALE_MS) ? o.value : null;
        const i = state.readings.In[dev];
        sample.in[dev] = (i && now - i.timestamp <= STALE_MS) ? i.value : null;
    });
    state.history.push(sample);
    state.lastHistoryTimestamp = now;
}

// ---- detected per-unit rating (auto or forced) ----
const ratedPerUnit = RATED_W_PER_UNIT > 0
    ? RATED_W_PER_UNIT
    : ratingClassFor(state.peakMagnitude || 0);

// ---- units for template ----
const units = deviceNumbers.map(dev => ({ device: dev, phase: phaseForDevice(dev) }));

// ---- output ----
msg.topic = "parallel_load_history";
msg.payload = {
    detected: {
        portalId: state.portalId,
        vebusInstance: state.vebusInstance,
        phases,
        totalUnits,
        deviceNumbers,
        ratedPerUnit,
        ratingAuto: !(RATED_W_PER_UNIT > 0)
    },
    ratedPerUnit,
    units,
    history: state.history,
    historyInfo: {
        windowMinutes: 60,
        sampleIntervalSeconds: HISTORY_SAMPLE_MS / 1000,
        samples: state.history.length
    },
    updated: new Date(now).toLocaleString("en-GB", { hour12: false })
};

context.set("parallelLoadHistory", state);

node.status({
    fill: "green", shape: "dot",
    text: phases + "φ · " + totalUnits + " units · "
        + Math.round(ratedPerUnit / 100) / 10 + " kW/unit · "
        + state.history.length + " samples"
});

return msg;
