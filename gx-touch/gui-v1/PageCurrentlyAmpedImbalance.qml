//////////////////////////////////////////////////////////////////////////////
// Currently Amped — Parallel Imbalance (native GX Touch view)
//
// Venus OS gui-v1 QML page. Renders the parallel VE.Bus imbalance view
// directly on the GX Touch / HDMI display: per-phase balance, per-unit
// load heat bars, hardest-unit flag, and a loose-connection voltage alert.
//
// Reads values straight off D-Bus (com.victronenergy.vebus). The light
// maths (balance, heat colour, rating %) is done here in QML JavaScript,
// so this page does NOT depend on Node-RED being present.
//
//  ####################################################################
//  #  EXPERIMENTAL / UNSUPPORTED — BENCH USE.                          #
//  #  Editing the Venus OS GUI is not supported by Victron and is      #
//  #  WIPED BY FIRMWARE UPDATES. Deploy only via SetupHelper so it     #
//  #  re-applies after updates, and test on a bench GX first — a bad   #
//  #  GUI edit can leave the touch screen unusable until you SSH in.   #
//  #  gui-v1 only: this will NOT carry to gui-v2 unchanged.            #
//  ####################################################################
//
// Currently Amped (Harare). Based on the original "parallel imbalance"
// monitoring idea; this is the native-display re-implementation.
//////////////////////////////////////////////////////////////////////////////

import QtQuick 2.0
import com.victron.velib 1.0

MbPage {
    id: root
    title: qsTr("Parallel Imbalance")

    // ---- CONFIG (set to match the system) -----------------------------------
    property string vebusService: "com.victronenergy.vebus"
    property int    unitCount:    12          // total inverter units
    property int    phaseCount:   3           // 1 or 3
    property real   ratedPerUnit: 20000       // W per unit (bar 100% reference)
    property real   spreadFullRatio: 0.25     // spread treated as "fully severe"
    property real   unitVwarn:    1.5         // per-unit V deviation (amber)
    property real   unitVcrit:    3.0         // per-unit V deviation (red)

    property var phaseColour: ["#f5a623", "#34d399", "#3b9eff"]  // L1, L2, L3

    // ---- LIVE DBUS ITEMS ----------------------------------------------------
    // Per-unit AC output power and voltage, pulled by device index.
    property var pOut: []
    property var vOut: []

    Component.onCompleted: buildItems()

    function buildItems() {
        var pArr = [], vArr = []
        for (var i = 0; i < unitCount; i++) {
            pArr.push(itemComp.createObject(root,
                { bind: vebusService + "/Devices/" + i + "/Ac/Out/P" }))
            vArr.push(itemComp.createObject(root,
                { bind: vebusService + "/Devices/" + i + "/Ac/Out/V" }))
        }
        pOut = pArr; vOut = vArr
    }

    Component {
        id: itemComp
        VBusItem {}
    }

    // ---- HELPERS ------------------------------------------------------------
    function phaseOfDevice(i) {
        if (phaseCount !== 3) return 0
        return i % 3                       // 0->L1, 1->L2, 2->L3 (interleaved)
    }

    function devicesInPhase(p) {
        var list = []
        for (var i = 0; i < unitCount; i++)
            if (phaseOfDevice(i) === p) list.push(i)
        return list
    }

    function watt(i) {
        var it = pOut[i]
        if (!it || !it.valid) return NaN
        return Math.abs(Number(it.value))
    }

    function volt(i) {
        var it = vOut[i]
        if (!it || !it.valid) return NaN
        return Number(it.value)
    }

    // heat ramp green -> yellow -> orange -> red
    function heat(t) {
        t = Math.max(0, Math.min(1, t))
        var stops = [[0,[46,199,113]],[0.45,[244,197,66]],[0.72,[239,140,59]],[1,[245,67,59]]]
        for (var i = 1; i < stops.length; i++) {
            if (t <= stops[i][0]) {
                var p0 = stops[i-1][0], c0 = stops[i-1][1]
                var p1 = stops[i][0],   c1 = stops[i][1]
                var f = (t - p0) / ((p1 - p0) || 1)
                var ch = function(k){ return Math.round(c0[k] + (c1[k]-c0[k])*f) }
                return Qt.rgba(ch(0)/255, ch(1)/255, ch(2)/255, 1)
            }
        }
        return Qt.rgba(1,0.26,0.23,1)
    }

    function phaseStats(p) {
        var devs = devicesInPhase(p)
        var vals = [], volts = []
        for (var k = 0; k < devs.length; k++) {
            var w = watt(devs[k]); if (!isNaN(w)) vals.push(w)
            var v = volt(devs[k]); if (!isNaN(v)) volts.push(v)
        }
        var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals)
        var avg = vals.length ? vals.reduce(function(a,b){return a+b},0)/vals.length : 0
        var bal = (hi > 0 && vals.length >= 2) ? lo/hi*100 : 100
        var vmean = volts.length ? volts.reduce(function(a,b){return a+b},0)/volts.length : 0
        return { devs: devs, lo: lo, hi: hi, avg: avg, bal: bal, vmean: vmean,
                 spread: (avg>0 && hi>lo) ? (hi-lo)/avg : 0 }
    }

    function balColour(bal) {
        if (bal >= 90) return "#34d399"
        if (bal >= 80) return "#f5a623"
        return "#f75c5c"
    }

    function fmtV(v) { return isNaN(v) ? "--" : v.toFixed(1) + " V" }

    // ---- LAYOUT -------------------------------------------------------------
    Rectangle {
        anchors.fill: parent
        color: "#0a0e16"

        Column {
            anchors.fill: parent
            anchors.margins: 4
            spacing: 2

            // header
            Rectangle {
                width: parent.width; height: 30; color: "#11161f"
                radius: 4
                Row {
                    anchors.verticalCenter: parent.verticalCenter
                    anchors.left: parent.left; anchors.leftMargin: 10; spacing: 8
                    Rectangle { width: 8; height: 8; radius: 4; color: "#34d399"
                        anchors.verticalCenter: parent.verticalCenter }
                    Text { text: "Currently Amped  ·  Parallel Imbalance"
                        color: "#eef2f8"; font.pixelSize: 14; font.bold: true
                        anchors.verticalCenter: parent.verticalCenter }
                }
                Text {
                    anchors.right: parent.right; anchors.rightMargin: 10
                    anchors.verticalCenter: parent.verticalCenter
                    color: "#7f8a9e"; font.pixelSize: 11
                    text: phaseCount + "φ · " + (unitCount/phaseCount) + "/phase · "
                          + (ratedPerUnit/1000).toFixed(0) + "kW/u"
                }
            }

            // one row per phase
            Repeater {
                model: phaseCount
                Rectangle {
                    width: parent.width
                    height: (root.height - 90) / phaseCount
                    color: "transparent"
                    border.color: "#1b2334"; border.width: 1; radius: 4

                    property var st: phaseStats(index)
                    property var pcol: phaseColour[index]

                    Row {
                        anchors.fill: parent
                        anchors.margins: 6
                        spacing: 8

                        // left: phase + balance
                        Column {
                            width: 110
                            anchors.verticalCenter: parent.verticalCenter
                            spacing: 2
                            Rectangle {
                                width: 34; height: 22; radius: 5; color: pcol
                                anchors.horizontalCenter: parent.horizontalCenter
                                Text { anchors.centerIn: parent
                                    text: "L" + (index+1); color: "#0b0f18"
                                    font.pixelSize: 13; font.bold: true }
                            }
                            Text {
                                anchors.horizontalCenter: parent.horizontalCenter
                                text: st.bal.toFixed(0) + "%"
                                color: balColour(st.bal)
                                font.pixelSize: 30; font.bold: true
                            }
                            Text {
                                anchors.horizontalCenter: parent.horizontalCenter
                                text: "BALANCE"; color: "#7f8a9e"; font.pixelSize: 9
                            }
                        }

                        // right: per-unit bars
                        Row {
                            height: parent.height
                            width: parent.width - 120
                            spacing: 0
                            Repeater {
                                model: st.devs.length
                                Item {
                                    width: (parent.width) / st.devs.length
                                    height: parent.height
                                    property int dev: st.devs[index]
                                    property real w: watt(dev)
                                    property real pct: isNaN(w) ? 0 : w / ratedPerUnit * 100
                                    property real t: (st.hi > st.lo)
                                        ? ((w - st.lo) / (st.hi - st.lo)) *
                                          Math.max(0, Math.min(1, st.spread / spreadFullRatio))
                                        : 0
                                    property bool hardest: (!isNaN(w) && w === st.hi && st.spread > 0.02)
                                    property real vdev: isNaN(volt(dev)) ? 0 : volt(dev) - st.vmean
                                    property bool vflag: Math.abs(vdev) >= unitVwarn

                                    Column {
                                        anchors.centerIn: parent
                                        spacing: 2
                                        Text {
                                            anchors.horizontalCenter: parent.horizontalCenter
                                            text: pct.toFixed(0) + "%"
                                            color: heat(t); font.pixelSize: 14; font.bold: true
                                        }
                                        Rectangle {
                                            anchors.horizontalCenter: parent.horizontalCenter
                                            width: 30; height: 78
                                            color: "#0f1622"; border.color: "#243044"
                                            radius: 3
                                            Rectangle {
                                                anchors.bottom: parent.bottom
                                                anchors.left: parent.left; anchors.right: parent.right
                                                anchors.margins: 1
                                                height: Math.max(0, Math.min(1, pct/100)) * 74
                                                radius: 2
                                                color: heat(t)
                                            }
                                        }
                                        Text {
                                            anchors.horizontalCenter: parent.horizontalCenter
                                            text: "U" + (index+1) + (vflag ? "  ⚠" : "")
                                            color: vflag ? "#f5a623" : "#eef2f8"
                                            font.pixelSize: 12; font.bold: true
                                        }
                                        Text {
                                            anchors.horizontalCenter: parent.horizontalCenter
                                            text: hardest ? "▲" : " "
                                            color: "#f5433b"; font.pixelSize: 10; font.bold: true
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
