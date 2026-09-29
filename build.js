const fs = require("fs");

const path = require("path");
const SRC = path.join(__dirname, "src");
const ORIG = path.join(SRC, "original-flow.json");
const orig = JSON.parse(fs.readFileSync(ORIG, "utf8"));

const fn = fs.readFileSync(path.join(SRC, "load_fn.js"), "utf8");
const loadTpl = fs.readFileSync(path.join(SRC, "load_template.html"), "utf8");
const graphFn = fs.readFileSync(path.join(SRC, "graph_fn.js"), "utf8");

function mustReplace(s, find, repl, label) {
    if (s.indexOf(find) === -1) { throw new Error("anchor not found: " + label); }
    return s.split(find).join(repl);
}

// Graph template: default Y-axis to the detected inverter rating,
// update the manual-scale hint, and show the rating in the footer.
function graphAutoRange(fmt) {
    fmt = mustReplace(fmt,
        "0 = individual auto scale",
        "0 = auto from inverter rating",
        "scale-help");
    fmt = mustReplace(fmt,
        "                return manual;\n            }",
        "                return manual;\n            }\n\n" +
        "            // Auto-range from detected inverter rating\n" +
        "            const rated = Number(this.msg.payload.ratedPerUnit);\n" +
        "            if (Number.isFinite(rated) && rated > 0) {\n" +
        "                let am = rated * 1.10;\n" +
        "                if (am > 10000) { am = Math.ceil(am / 5000) * 5000; }\n" +
        "                else if (am > 5000) { am = Math.ceil(am / 1000) * 1000; }\n" +
        "                else if (am > 2000) { am = Math.ceil(am / 500) * 500; }\n" +
        "                else { am = Math.ceil(am / 250) * 250; }\n" +
        "                return am;\n" +
        "            }",
        "chartMaximum");
    fmt = mustReplace(fmt,
        "        Updated:",
        "        {{ formatWatts(msg.payload.ratedPerUnit) }}/unit auto\n\n        ·\n\n        Updated:",
        "footer");
    return fmt;
}

// ---- shared dark theme (reuse the existing theme id so every page uses it) ----
const THEME_ID = "7e36f3ca432c50ad";
const UI_BASE = "8d458562c28cd910";
const BROKER = "b38406e40971a766";

// ---- dark CSS for the original two widgets (class names unchanged) ----
const tablesStyle = `
.parallel-balance{width:100%;overflow-x:auto;background:#141b29;border:1px solid #243044;border-radius:12px;padding:14px 16px;color:#eef2f8;font-family:Inter,Roboto,'Segoe UI',system-ui,sans-serif;}
.parallel-balance h3{margin:10px 0 6px 0;font-size:15px;font-weight:700;color:#eef2f8;}
.parallel-balance table{width:100%;border-collapse:collapse;margin-bottom:18px;font-size:14px;}
.parallel-balance th,.parallel-balance td{border:1px solid #243044;padding:8px;text-align:right;white-space:nowrap;}
.parallel-balance th:first-child,.parallel-balance td:first-child{text-align:left;}
.parallel-balance thead th{background:#1b2334;color:#b7c0d0;font-weight:600;}
.parallel-balance td small{display:block;margin-top:2px;color:#7f8a9e;font-size:10px;}
.parallel-balance td.excellent{background:#1e6b4f;color:#eafff5;font-weight:700;}
.parallel-balance td.good{background:#2f7d46;color:#eafff0;font-weight:700;}
.parallel-balance td.warning{background:#8a6a12;color:#fff6df;font-weight:700;}
.parallel-balance td.poor{background:#8a4f1a;color:#ffe9d6;font-weight:700;}
.parallel-balance td.bad{background:#8a2f2f;color:#ffe3e3;font-weight:700;}
.parallel-balance td.low-load{background:#1b2334;color:#7f8a9e;}
.parallel-balance td.unknown,.parallel-balance td.stale{background:#161d2b;color:#66707f;}
.parallel-balance .legend{color:#7f8a9e;font-size:12px;margin-top:-8px;}
.parallel-balance .updated{color:#7f8a9e;font-size:12px;text-align:right;}
`;

const graphStyle = `
.load-history{width:100%;background:#141b29;border:1px solid #243044;border-radius:12px;padding:10px 6px 14px;color:#eef2f8;font-family:Inter,Roboto,'Segoe UI',system-ui,sans-serif;}
.load-history h2{margin:20px 0 12px 58px;font-size:18px;font-weight:700;color:#eef2f8;}
.chart-section{margin-bottom:28px;}
.chart-section h3{margin:8px 0 10px 58px;font-size:14px;font-weight:600;color:#b7c0d0;}
.scale-control{display:flex;align-items:center;justify-content:flex-end;gap:6px;margin:6px 12px 16px 58px;font-size:12px;color:#b7c0d0;}
.scale-control input{width:90px;padding:5px 7px;border:1px solid #243044;border-radius:6px;background:#0f1622;color:#eef2f8;text-align:right;}
.scale-help{margin-left:4px;color:#7f8a9e;}
.chart-area{position:relative;height:325px;margin-left:58px;margin-right:12px;border:1px solid #243044;border-radius:8px;background:#0f1622;}
.chart{width:100%;height:300px;display:block;}
.grid{stroke:#33405a;stroke-width:1;stroke-dasharray:4 4;opacity:.5;vector-effect:non-scaling-stroke;}
.unit-line{fill:none;stroke-width:2.5;stroke-linejoin:round;stroke-linecap:round;vector-effect:non-scaling-stroke;}
.axis-title,.axis-middle,.axis-zero{position:absolute;left:-55px;width:48px;text-align:right;font-size:11px;color:#7f8a9e;}
.axis-title{top:-7px;}
.axis-middle{top:143px;}
.axis-zero{top:293px;}
.time{position:absolute;bottom:1px;font-size:11px;color:#7f8a9e;}
.t60{left:3px;}
.t45{left:25%;transform:translateX(-50%);}
.t30{left:50%;transform:translateX(-50%);}
.t15{left:75%;transform:translateX(-50%);}
.t0{right:3px;}
.legend{margin:8px 10px 0 58px;display:flex;flex-wrap:wrap;justify-content:center;gap:6px 16px;font-size:11px;font-weight:600;color:#b7c0d0;}
.footer{margin:12px 12px 0 58px;text-align:right;color:#7f8a9e;font-size:11px;}
.waiting{padding:20px;color:#7f8a9e;}
`;

function swapStyle(fmt, css) {
    const a = fmt.indexOf("<style>");
    const b = fmt.lastIndexOf("</style>");
    if (a === -1 || b === -1) { throw new Error("no style block"); }
    return fmt.slice(0, a) + "<style>\n" + css + "\n</style>" + fmt.slice(b + 8);
}

// ---- transform the original nodes in place ----
const out = orig.map(node => {
    // shared dark theme
    if (node.type === "ui-theme" && node.id === THEME_ID) {
        return {
            ...node,
            name: "Currently Amped Dark",
            colors: {
                surface: "#0f1622",
                primary: "#3b9eff",
                bgPage: "#0a0e16",
                groupBg: "#0a0e16",
                groupOutline: "#0a0e16"
            },
            sizes: {
                density: "default",
                pagePadding: "12px",
                groupGap: "12px",
                groupBorderRadius: "12px",
                widgetGap: "12px"
            }
        };
    }
    // re-skin the two widgets
    if (node.type === "ui-template" && node.id === "c076fbf0df1e73a6") {
        return { ...node, format: swapStyle(node.format, tablesStyle) };
    }
    if (node.type === "ui-template" && node.id === "fc2a8157ae832df9") {
        return { ...node, format: swapStyle(graphAutoRange(node.format), graphStyle) };
    }
    // swap in the auto-rating history function
    if (node.type === "function" && node.id === "3acbfe08f1fa9e86") {
        return { ...node, func: graphFn };
    }
    // groups: let each widget own its header, widen the graph group
    if (node.type === "ui-group") {
        return { ...node, showTitle: false, width: "20" };
    }
    // tidy page order/icons
    if (node.type === "ui-page" && node.id === "57a63bcd36188646") {
        return { ...node, order: 2, icon: "table-large" };
    }
    if (node.type === "ui-page" && node.id === "2c0042507f23fe04") {
        return { ...node, name: "Load History", order: 3, icon: "chart-line" };
    }
    return node;
});

// ---- new Inverter Load page nodes ----
const TAB = "a1c2e3f405162738";
const MQTT_IN = "b2d3f40516273849";
const FUNC = "c3e405162738495a";
const KEEPALIVE = "d4f5061627384950";
const TICK = "e50617283949aab0";
const TEMPLATE = "f6172839495aabc0";
const DEBUG = "a728394a5b6cdcf0";
const PAGE = "b839405a6b7cdf00";
const GROUP = "c94a5b6c7d8ef100";

const loadNodes = [
    { id: TAB, type: "tab", label: "Inverter Load %", disabled: false, info: "", env: [] },
    {
        id: MQTT_IN, type: "mqtt in", z: TAB, name: "All unit AC power",
        topic: "N/+/vebus/+/Devices/+/Ac/+/P", qos: "1", datatype: "auto-detect",
        broker: BROKER, nl: false, rap: true, rh: 0, inputs: 0, x: 180, y: 120, wires: [[FUNC]]
    },
    {
        id: "a2b3c4d5e6f70810", type: "mqtt in", z: TAB, name: "AC output voltage",
        topic: "N/+/vebus/+/Ac/Out/+/V", qos: "1", datatype: "auto-detect",
        broker: BROKER, nl: false, rap: true, rh: 0, inputs: 0, x: 180, y: 260, wires: [[FUNC]]
    },
    {
        id: "a4b5c6d7e8f90a12", type: "mqtt in", z: TAB, name: "Per-unit AC out voltage",
        topic: "N/+/vebus/+/Devices/+/Ac/+/V", qos: "1", datatype: "auto-detect",
        broker: BROKER, nl: false, rap: true, rh: 0, inputs: 0, x: 195, y: 320, wires: [[FUNC]]
    },
    {
        id: KEEPALIVE, type: "inject", z: TAB, name: "VRM MQTT keepalive",
        props: [{ p: "payload" }], repeat: "30", crontab: "", once: true, onceDelay: 0.5,
        topic: "", payload: "", payloadType: "date", x: 180, y: 80, wires: [[]]
    },
    {
        id: TICK, type: "inject", z: TAB, name: "Refresh stale status",
        props: [{ p: "topic", vt: "str" }], repeat: "30", crontab: "", once: true, onceDelay: 2,
        topic: "load-percent-tick", x: 190, y: 200, wires: [[FUNC]]
    },
    {
        id: FUNC, type: "function", z: TAB, name: "Build load % bars",
        func: fn, outputs: 1, timeout: 0, noerr: 0, initialize: "", finalize: "", libs: [],
        x: 470, y: 140, wires: [[TEMPLATE, DEBUG]]
    },
    {
        id: TEMPLATE, type: "ui-template", z: TAB, group: GROUP, page: "", ui: "",
        name: "Inverter load % (dark)", order: 1, width: "0", height: "0", head: "",
        format: loadTpl, storeOutMessages: true, passthru: true, resendOnRefresh: true,
        templateScope: "local", className: "", x: 760, y: 120, wires: [[]]
    },
    {
        id: DEBUG, type: "debug", z: TAB, name: "debug", active: false, tosidebar: true,
        console: false, tostatus: false, complete: "true", targetType: "full",
        statusVal: "", statusType: "auto", x: 750, y: 220, wires: []
    },
    {
        id: GROUP, type: "ui-group", name: "Inverter Load", page: PAGE,
        width: "20", height: 1, order: 1, showTitle: false, className: "",
        visible: "true", disabled: "false", groupType: "default"
    },
    {
        id: PAGE, type: "ui-page", name: "Inverter Load %", ui: UI_BASE, path: "/load",
        icon: "chart-bar", layout: "grid", theme: THEME_ID,
        breakpoints: [
            { name: "Default", px: "0", cols: "3" },
            { name: "Tablet", px: "576", cols: "6" },
            { name: "Small Desktop", px: "768", cols: "9" },
            { name: "Desktop", px: "1024", cols: "12" }
        ],
        order: 1, className: "", visible: "true", disabled: "false"
    }
];

const combined = out.concat(loadNodes);

const OUT = path.join(__dirname, "victron-parallel-imbalance.json");
fs.writeFileSync(OUT, JSON.stringify(combined, null, 4));
JSON.parse(fs.readFileSync(OUT, "utf8"));

// sanity summary
const byType = {};
combined.forEach(n => { byType[n.type] = (byType[n.type] || 0) + 1; });
console.log("total nodes:", combined.length);
console.log(JSON.stringify(byType));
console.log("pages:", combined.filter(n => n.type === "ui-page").map(p => p.name + " (" + p.path + ")").join(", "));
