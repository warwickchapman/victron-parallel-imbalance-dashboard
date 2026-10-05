/*
** Currently Amped — Parallel Imbalance (native GX Touch page, Venus OS gui-v2)
**
** Renders the parallel VE.Bus imbalance view directly on the GX Touch / HDMI
** screen as a native gui-v2 page: per-phase current-sharing balance, per-unit
** load "heat" bars (green = lightest, red = hardest), the hardest-unit flag,
** and a per-unit output-voltage / loose-connection check.
**
** Data comes straight off the VE.Bus service via VeQuickItem (the same source
** the stock pages use), so this does NOT depend on the Node-RED flow.
**
** Because it is built from Theme.color_* tokens, it follows the GX's own
** Light / Dark setting automatically — no separate theming needed.
**
**  ####################################################################
**  #  EXPERIMENTAL / UNSUPPORTED — BENCH USE.                          #
**  #  Modifying the Venus OS GUI is not supported by Victron and is    #
**  #  replaced by firmware updates. gui-v2 is a BUILT app, so this     #
**  #  page is added by building gui-v2 from source with the file       #
**  #  included, or via a gui-v2 mod tool (e.g. SetupHelper / a gui-v2  #
**  #  mod manager). Test on a bench GX first; keep backups.            #
**  #  This file follows gui-v2 conventions but MUST be compiled and    #
**  #  checked against your gui-v2 version — its component API moves.    #
**  ####################################################################
**
** Currently Amped (Harare). Native-display re-implementation of the original
** "parallel imbalance" monitoring idea.
*/

import QtQuick
import Victron.VenusOS

Page {
	id: root

	// VE.Bus service uid (auto-discovered); override to pin a specific service.
	property string bindPrefix: Global.system.veBus.serviceUid

	// ---- config ----
	readonly property int unitCount: 12          // total inverter units
	readonly property int phaseCount: 3          // 1 or 3
	readonly property real ratedPerUnit: 20000   // W per unit (bar 100% reference)
	readonly property real spreadFullRatio: 0.25 // spread treated as "fully severe"
	readonly property real unitVwarn: 1.5        // per-unit V deviation (amber)
	readonly property real unitVcrit: 3.0        // per-unit V deviation (red)
	readonly property real _leftWidth: width * 0.20
	readonly property real _barWidth: Math.max(10, width * 0.028)

	// live per-unit values, keyed by device index
	property var unitW: ({})
	property var unitV: ({})
	property int _tick: 0        // bumps to force recompute/redraw

	title: qsTr("Parallel Imbalance")

	// ---- live data: one VeQuickItem pair per unit ----
	Instantiator {
		model: root.unitCount
		delegate: QtObject {
			required property int index
			readonly property VeQuickItem _p: VeQuickItem {
				uid: root.bindPrefix + "/Devices/" + index + "/Ac/Out/P"
				onValueChanged: { root.unitW[index] = value; root._tick++ }
			}
			readonly property VeQuickItem _v: VeQuickItem {
				uid: root.bindPrefix + "/Devices/" + index + "/Ac/Out/V"
				onValueChanged: { root.unitV[index] = value; root._tick++ }
			}
		}
	}

	// ---- helpers ----
	function phaseOfDevice(i) { return root.phaseCount === 3 ? (i % 3) : 0 }
	function devicesInPhase(p) {
		const a = []
		for (let i = 0; i < root.unitCount; i++) if (phaseOfDevice(i) === p) a.push(i)
		return a
	}
	function watt(i) {
		const v = root.unitW[i]
		return (v === undefined || v === null || isNaN(v)) ? NaN : Math.abs(v)
	}
	function volt(i) {
		const v = root.unitV[i]
		return (v === undefined || v === null || isNaN(v)) ? NaN : v
	}

	// green -> yellow -> orange -> red severity ramp (kept vivid in both themes)
	function heat(t) {
		t = Math.max(0, Math.min(1, t))
		const stops = [[0,[46,199,113]],[0.45,[244,197,66]],[0.72,[239,140,59]],[1,[245,67,59]]]
		for (let i = 1; i < stops.length; i++) {
			if (t <= stops[i][0]) {
				const p0 = stops[i-1][0], c0 = stops[i-1][1]
				const p1 = stops[i][0],   c1 = stops[i][1]
				const f = (t - p0) / ((p1 - p0) || 1)
				const ch = k => Math.round(c0[k] + (c1[k]-c0[k]) * f)
				return Qt.rgba(ch(0)/255, ch(1)/255, ch(2)/255, 1)
			}
		}
		return Qt.rgba(1, 0.26, 0.23, 1)
	}

	function phaseStats(p) {
		root._tick            // dependency: recompute when values change
		const devs = devicesInPhase(p)
		const w = [], v = []
		for (const d of devs) {
			const x = watt(d); if (!isNaN(x)) w.push(x)
			const y = volt(d); if (!isNaN(y)) v.push(y)
		}
		const lo = w.length ? Math.min(...w) : 0
		const hi = w.length ? Math.max(...w) : 0
		const avg = w.length ? w.reduce((a,b)=>a+b,0)/w.length : 0
		const bal = (hi > 0 && w.length >= 2) ? lo/hi*100 : 100
		const vmean = v.length ? v.reduce((a,b)=>a+b,0)/v.length : 0
		return { devs, lo, hi, avg, bal, vmean,
			spread: (avg > 0 && hi > lo) ? (hi-lo)/avg : 0 }
	}

	function balColor(bal) {
		if (bal >= 90) return Theme.color_ok
		if (bal >= 80) return Theme.color_warning
		return Theme.color_critical
	}

	// ---- layout ----
	GradientListView {
		anchors.fill: parent

		model: root.phaseCount

		delegate: Item {
			id: phaseRow
			required property int index
			width: ListView.view.width
			height: Math.round(root.height / root.phaseCount)

			readonly property var st: root.phaseStats(index)
			readonly property string phaseName: "L" + (index + 1)

			Row {
				anchors.fill: parent
				anchors.margins: Theme.geometry_page_content_horizontalMargin
				spacing: Theme.geometry_gradientList_spacing

				// left: phase + balance
				Column {
					width: root._leftWidth
					anchors.verticalCenter: parent.verticalCenter
					spacing: 2

					Label {
						text: phaseRow.phaseName
						color: Theme.color_font_primary
						font.pixelSize: Theme.font_size_body2
						font.bold: true
					}
					Label {
						text: phaseRow.st.bal.toFixed(0) + "%"
						color: root.balColor(phaseRow.st.bal)
						font.pixelSize: Theme.font_size_h1
						font.bold: true
					}
					Label {
						//% "Balance"
						text: qsTrId("ca_balance")
						color: Theme.color_font_secondary
						font.pixelSize: Theme.font_size_caption
					}
				}

				// right: per-unit bars
				Row {
					height: parent.height
					width: parent.width - root._leftWidth
					spacing: 0

					Repeater {
						model: phaseRow.st.devs.length
						delegate: Item {
							required property int index
							width: parent.width / phaseRow.st.devs.length
							height: parent.height

							readonly property int dev: phaseRow.st.devs[index]
							readonly property real w: root.watt(dev)
							readonly property real pct: isNaN(w) ? 0 : w / root.ratedPerUnit * 100
							readonly property real t: (phaseRow.st.hi > phaseRow.st.lo)
								? ((w - phaseRow.st.lo) / (phaseRow.st.hi - phaseRow.st.lo)) *
								  Math.max(0, Math.min(1, phaseRow.st.spread / root.spreadFullRatio))
								: 0
							readonly property bool hardest: !isNaN(w) && w === phaseRow.st.hi && phaseRow.st.spread > 0.02
							readonly property real vdev: isNaN(root.volt(dev)) ? 0 : root.volt(dev) - phaseRow.st.vmean
							readonly property bool vflag: Math.abs(vdev) >= root.unitVwarn

							Column {
								anchors.centerIn: parent
								spacing: 2

								Label {
									anchors.horizontalCenter: parent.horizontalCenter
									text: pct.toFixed(0) + "%"
									color: root.heat(t)
									font.pixelSize: Theme.font_size_body2
									font.bold: true
								}
								Rectangle {   // bar track
									anchors.horizontalCenter: parent.horizontalCenter
									width: root._barWidth
									height: phaseRow.height * 0.42
									radius: 3
									color: Theme.color_background_secondary
									border.color: Theme.color_card_separator
									Rectangle {   // fill
										anchors { bottom: parent.bottom; left: parent.left; right: parent.right; margins: 1 }
										height: Math.max(0, Math.min(1, pct/100)) * (parent.height - 2)
										radius: 2
										color: root.heat(t)
									}
								}
								Label {
									anchors.horizontalCenter: parent.horizontalCenter
									text: "U" + (index + 1) + (vflag ? "  ⚠" : "")
									color: vflag ? Theme.color_warning : Theme.color_font_primary
									font.pixelSize: Theme.font_size_caption
									font.bold: true
								}
								Label {
									anchors.horizontalCenter: parent.horizontalCenter
									text: hardest ? "▲" : " "
									color: Theme.color_critical
									font.pixelSize: Theme.font_size_caption
									font.bold: true
								}
							}
						}
					}
				}
			}

			Rectangle {   // row separator
				anchors { left: parent.left; right: parent.right; bottom: parent.bottom }
				height: 1
				color: Theme.color_card_separator
				visible: phaseRow.index < root.phaseCount - 1
			}
		}
	}
}
