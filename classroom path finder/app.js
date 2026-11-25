// ============================================================================
// Classroom Path Finder — 4-Floor SVG Blueprint + C++ Dijkstra (with fallback)
// ============================================================================

const FLOOR_TITLES = {
  gf: "GROUND FLOOR",
  "1f": "FIRST FLOOR",
  "2f": "SECOND FLOOR",
  "3f": "THIRD FLOOR"
};

const FLOOR_NAMES = {
  gf: "Ground Floor",
  "1f": "First Floor",
  "2f": "Second Floor",
  "3f": "Third Floor"
};

const CATEGORY_STYLES = {
  lab: { stroke: "#10b981", fill: "rgba(16, 185, 129, 0.09)" },
  office: { stroke: "#f43f5e", fill: "rgba(244, 63, 94, 0.09)" },
  utility: { stroke: "#f59e0b", fill: "rgba(245, 158, 11, 0.09)" },
  classroom: { stroke: "#475569", fill: "rgba(30, 41, 59, 0.62)" }
};

const state = {
  nodes: [],
  edges: [],
  usingFallback: false,
  currentFloor: "gf",
  startId: "gf_entrance",
  endId: "",
  highlightedId: null,
  activeRoute: null,
  pan: { x: 0, y: 0, scale: 1 },
  dragging: false,
  dragStart: { x: 0, y: 0 },
  dragMoved: false
};

const el = {
  quickSearchInput: document.getElementById("quickSearchInput"),
  clearQuickSearch: document.getElementById("clearQuickSearch"),
  quickSearchDropdown: document.getElementById("quickSearchDropdown"),
  floorPills: document.querySelectorAll(".floor-pill"),
  floorWatermark: document.getElementById("floorWatermark"),
  startInput: document.getElementById("startInput"),
  startDropdown: document.getElementById("startDropdown"),
  endInput: document.getElementById("endInput"),
  clearEndBtn: document.getElementById("clearEndBtn"),
  endDropdown: document.getElementById("endDropdown"),
  swapBtn: document.getElementById("swapBtn"),
  navigateBtn: document.getElementById("navigateBtn"),
  stopNavBtn: document.getElementById("stopNavBtn"),
  routeCard: document.getElementById("routeCard"),
  routeDistance: document.getElementById("routeDistance"),
  routeTime: document.getElementById("routeTime"),
  routeFloors: document.getElementById("routeFloors"),
  routeSteps: document.getElementById("routeSteps"),
  routeError: document.getElementById("routeError"),
  floorSvg: document.getElementById("floorSvg"),
  viewportGroup: document.getElementById("viewportGroup"),
  corridorLayer: document.getElementById("corridorLayer"),
  roomLayer: document.getElementById("roomLayer"),
  routeLayer: document.getElementById("routeLayer")
};

// ---------------- Built-in Fallback Graph & Dijkstra (if opened without server.exe) ----------------
function buildFallbackGraph() {
  const nodes = [];
  const edges = [];
  const addRoom = (id, label, x, y, w, h, floor, type, category, verticalText = false, badge = "") =>
    nodes.push({ id, label, x, y, w, h, floor, type, category, verticalText, badge });
  const addCor = (id, x, y, floor) =>
    nodes.push({ id, label: "Corridor", x, y, w: 0, h: 0, floor, type: "corridor", category: "corridor", verticalText: false, badge: "" });
  const link = (from, to, weight = 0, isVertical = false) =>
    edges.push({ from, to, weight, isVertical });

  const floors = ["gf", "1f", "2f", "3f"];
  for (const f of floors) {
    addRoom(`${f}_girls_washroom`, "GIRLS WASHROOM", 105, 290, 56, 195, f, "room", "utility", true, "female");
    addRoom(`${f}_boys_washroom`, "BOYS WASHROOM", 169, 290, 56, 195, f, "room", "utility", true, "male");
    addRoom(`${f}_stairs_left`, "STAIRS LEFT", 246, 315, 84, 145, f, "stair", "utility");
    addRoom(`${f}_lift`, "LIFT", 750, 315, 76, 145, f, "lift", "utility");
    addRoom(`${f}_stairs_right`, "STAIRS RIGHT", 834, 315, 78, 145, f, "stair", "utility");

    addCor(`${f}_c_gw`, 105, 420, f);
    addCor(`${f}_c_bw`, 169, 420, f);
    addCor(`${f}_c_sl`, 246, 420, f);
    addCor(`${f}_c_mleft`, 365, 420, f);
    addCor(`${f}_c_mid`, 500, 420, f);
    addCor(`${f}_c_ent`, 635, 420, f);
    addCor(`${f}_c_lift`, 750, 420, f);
    addCor(`${f}_c_sr`, 834, 420, f);
    addCor(`${f}_c_mright`, 955, 420, f);
    addCor(`${f}_c_ejunc`, 1110, 420, f);

    addCor(`${f}_e_top`, 1110, 145, f);
    addCor(`${f}_e_upper`, 1110, 275, f);
    addCor(`${f}_e_low1`, 1110, 535, f);
    addCor(`${f}_e_low2`, 1110, 625, f);
    addCor(`${f}_e_bot`, 1110, 725, f);

    link(`${f}_c_gw`, `${f}_c_bw`);
    link(`${f}_c_bw`, `${f}_c_sl`);
    link(`${f}_c_sl`, `${f}_c_mleft`);
    link(`${f}_c_mleft`, `${f}_c_mid`);
    link(`${f}_c_mid`, `${f}_c_ent`);
    link(`${f}_c_ent`, `${f}_c_lift`);
    link(`${f}_c_lift`, `${f}_c_sr`);
    link(`${f}_c_sr`, `${f}_c_mright`);
    link(`${f}_c_mright`, `${f}_c_ejunc`);
    link(`${f}_e_top`, `${f}_e_upper`);
    link(`${f}_e_upper`, `${f}_c_ejunc`);
    link(`${f}_c_ejunc`, `${f}_e_low1`);
    link(`${f}_e_low1`, `${f}_e_low2`);
    link(`${f}_e_low2`, `${f}_e_bot`);
    link(`${f}_girls_washroom`, `${f}_c_gw`);
    link(`${f}_boys_washroom`, `${f}_c_bw`);
    link(`${f}_stairs_left`, `${f}_c_sl`);
    link(`${f}_lift`, `${f}_c_lift`);
    link(`${f}_stairs_right`, `${f}_c_sr`);
  }

  for (let i = 0; i + 1 < floors.length; i++) {
    link(`${floors[i]}_lift`, `${floors[i + 1]}_lift`, 80, true);
    link(`${floors[i]}_stairs_left`, `${floors[i + 1]}_stairs_left`, 130, true);
    link(`${floors[i]}_stairs_right`, `${floors[i + 1]}_stairs_right`, 130, true);
  }

  // GF
  addRoom("gf_m004", "M004", 385, 315, 175, 145, "gf", "room", "lab", false, "pc");
  addRoom("gf_m001", "M001", 960, 315, 150, 145, "gf", "room", "lab");
  addRoom("gf_m005", "M005", 175, 535, 195, 145, "gf", "room", "classroom");
  addRoom("gf_m003", "M003", 385, 535, 195, 145, "gf", "room", "classroom");
  addRoom("gf_entrance", "MAIN ENTRANCE", 635, 650, 118, 120, "gf", "entrance", "classroom");
  addRoom("gf_m002", "M002", 755, 535, 105, 145, "gf", "room", "classroom");
  addRoom("gf_m007", "M007 C-IOT LAB", 880, 535, 125, 145, "gf", "room", "lab", false, "pc");
  addRoom("gf_hod_office", "HOD OFFICE", 1005, 505, 88, 105, "gf", "room", "office");
  addRoom("gf_top_cabin", "TOP CABIN", 1110, 125, 130, 85, "gf", "room", "office");
  addRoom("gf_cabin_c", "CABIN C", 1210, 275, 86, 68, "gf", "room", "office");
  addRoom("gf_east_junc", "EAST JUNCTION", 1210, 420, 96, 64, "gf", "room", "office");
  addRoom("gf_cabin_e", "CABIN E", 1020, 595, 76, 54, "gf", "room", "office");
  addRoom("gf_fac_cabin_e", "FACULTY CABIN (E)", 1015, 668, 92, 54, "gf", "room", "office");
  addRoom("gf_cabin_d", "CABIN D", 1200, 595, 76, 54, "gf", "room", "office");
  addRoom("gf_fac_cabin_d", "FACULTY CABIN (D)", 1205, 668, 92, 54, "gf", "room", "office");
  addRoom("gf_bottom_cabin", "BOTTOM CABIN", 1110, 755, 106, 56, "gf", "room", "office");
  addCor("gf_c_m002", 755, 420, "gf");
  addCor("gf_c_m007", 880, 420, "gf");
  addCor("gf_c_hod", 1005, 420, "gf");
  addCor("gf_e_cab", 1110, 595, "gf");
  addCor("gf_e_fac", 1110, 668, "gf");
  link("gf_c_mleft", "gf_m004"); link("gf_c_mleft", "gf_m003"); link("gf_c_bw", "gf_m005");
  link("gf_c_ent", "gf_entrance"); link("gf_c_lift", "gf_c_m002"); link("gf_c_m002", "gf_m002");
  link("gf_c_m002", "gf_c_sr"); link("gf_c_sr", "gf_c_m007"); link("gf_c_m007", "gf_m007");
  link("gf_c_m007", "gf_c_mright"); link("gf_c_mright", "gf_m001"); link("gf_c_mright", "gf_c_hod");
  link("gf_c_hod", "gf_hod_office"); link("gf_c_hod", "gf_c_ejunc"); link("gf_e_top", "gf_top_cabin");
  link("gf_e_upper", "gf_cabin_c"); link("gf_c_ejunc", "gf_east_junc"); link("gf_e_low1", "gf_e_cab");
  link("gf_e_cab", "gf_cabin_e"); link("gf_e_cab", "gf_cabin_d"); link("gf_e_cab", "gf_e_low2");
  link("gf_e_low2", "gf_e_fac"); link("gf_e_fac", "gf_fac_cabin_e"); link("gf_e_fac", "gf_fac_cabin_d");
  link("gf_e_fac", "gf_e_bot"); link("gf_e_bot", "gf_bottom_cabin");

  // 1F
  addRoom("1f_m104", "M104", 395, 315, 195, 145, "1f", "room", "lab");
  addRoom("1f_m101", "M101", 960, 315, 150, 145, "1f", "room", "lab");
  addRoom("1f_m105", "M105", 175, 535, 195, 145, "1f", "room", "classroom");
  addRoom("1f_m103", "M103", 385, 535, 195, 145, "1f", "room", "classroom");
  addRoom("1f_m102", "M102", 775, 535, 165, 145, "1f", "room", "classroom");
  addRoom("1f_hod_office", "HOD OFFICE", 970, 505, 118, 105, "1f", "room", "office");
  addRoom("1f_cabin_a", "CABIN A", 1210, 215, 86, 64, "1f", "room", "office");
  addRoom("1f_east_junc", "EAST JUNCTION", 1210, 420, 96, 64, "1f", "room", "office");
  addRoom("1f_cabin_e", "CABIN E", 1020, 595, 76, 54, "1f", "room", "office");
  addRoom("1f_fac_cabin_e", "FACULTY CABIN (E)", 1015, 668, 92, 54, "1f", "room", "office");
  addRoom("1f_bottom_cabin", "BOTTOM END CABIN", 1110, 755, 118, 56, "1f", "room", "office");
  addCor("1f_c_m102", 775, 420, "1f");
  addCor("1f_c_hod", 970, 420, "1f");
  addCor("1f_e_caba", 1110, 215, "1f");
  addCor("1f_e_cab", 1110, 595, "1f");
  addCor("1f_e_fac", 1110, 668, "1f");
  link("1f_c_mleft", "1f_m104"); link("1f_c_mleft", "1f_m103"); link("1f_c_bw", "1f_m105");
  link("1f_c_lift", "1f_c_m102"); link("1f_c_m102", "1f_m102"); link("1f_c_m102", "1f_c_sr");
  link("1f_c_mright", "1f_m101"); link("1f_c_mright", "1f_c_hod"); link("1f_c_hod", "1f_hod_office");
  link("1f_c_hod", "1f_c_ejunc"); link("1f_e_top", "1f_e_caba"); link("1f_e_caba", "1f_cabin_a");
  link("1f_e_caba", "1f_e_upper"); link("1f_c_ejunc", "1f_east_junc"); link("1f_e_low1", "1f_e_cab");
  link("1f_e_cab", "1f_cabin_e"); link("1f_e_cab", "1f_e_low2"); link("1f_e_low2", "1f_e_fac");
  link("1f_e_fac", "1f_fac_cabin_e"); link("1f_e_fac", "1f_e_bot"); link("1f_e_bot", "1f_bottom_cabin");

  // 2F
  addRoom("2f_m204", "M204", 345, 315, 100, 145, "2f", "room", "classroom");
  addRoom("2f_drc", "DATA RESEARCH CENTRE", 550, 315, 270, 145, "2f", "room", "lab");
  addRoom("2f_m201", "M201", 960, 315, 150, 145, "2f", "room", "classroom");
  addRoom("2f_m205", "M205", 175, 535, 195, 145, "2f", "room", "classroom");
  addRoom("2f_m203", "M203", 385, 535, 195, 145, "2f", "room", "classroom");
  addRoom("2f_pvc", "PRO-VICE CHANCELLOR OFFICE", 590, 535, 195, 145, "2f", "room", "office");
  addRoom("2f_m202", "M202", 770, 535, 130, 145, "2f", "room", "classroom");
  addRoom("2f_hod_office", "HOD OFFICE", 965, 505, 145, 105, "2f", "room", "office");
  addRoom("2f_acad_sec", "ACADEMIC SECTION", 1110, 145, 140, 82, "2f", "room", "classroom");
  addRoom("2f_cabin_a", "CABIN A", 1210, 240, 86, 62, "2f", "room", "office");
  addRoom("2f_east_junc", "EAST JUNCTION", 1210, 420, 96, 64, "2f", "room", "office");
  addRoom("2f_cabin_e", "CABIN E", 1020, 595, 76, 54, "2f", "room", "office");
  addRoom("2f_fac_cabin_e", "FACULTY CABIN (E)", 1015, 668, 92, 54, "2f", "room", "office");
  addRoom("2f_cabin_d", "CABIN D", 1200, 595, 76, 54, "2f", "room", "office");
  addRoom("2f_fac_cabin", "FACULTY CABIN", 1110, 755, 112, 56, "2f", "room", "office");
  addCor("2f_c_m204", 345, 420, "2f");
  addCor("2f_c_drc", 550, 420, "2f");
  addCor("2f_c_pvc", 590, 420, "2f");
  addCor("2f_c_m202", 770, 420, "2f");
  addCor("2f_c_hod", 965, 420, "2f");
  addCor("2f_e_caba", 1110, 240, "2f");
  addCor("2f_e_cab", 1110, 595, "2f");
  addCor("2f_e_fac", 1110, 668, "2f");
  link("2f_c_sl", "2f_c_m204"); link("2f_c_m204", "2f_m204"); link("2f_c_m204", "2f_c_mleft");
  link("2f_c_mleft", "2f_m203"); link("2f_c_bw", "2f_m205"); link("2f_c_mid", "2f_c_drc");
  link("2f_c_drc", "2f_drc"); link("2f_c_drc", "2f_c_pvc"); link("2f_c_pvc", "2f_pvc");
  link("2f_c_pvc", "2f_c_ent"); link("2f_c_lift", "2f_c_m202"); link("2f_c_m202", "2f_m202");
  link("2f_c_m202", "2f_c_sr"); link("2f_c_mright", "2f_m201"); link("2f_c_mright", "2f_c_hod");
  link("2f_c_hod", "2f_hod_office"); link("2f_c_hod", "2f_c_ejunc"); link("2f_e_top", "2f_acad_sec");
  link("2f_e_top", "2f_e_caba"); link("2f_e_caba", "2f_cabin_a"); link("2f_e_caba", "2f_e_upper");
  link("2f_c_ejunc", "2f_east_junc"); link("2f_e_low1", "2f_e_cab"); link("2f_e_cab", "2f_cabin_e");
  link("2f_e_cab", "2f_cabin_d"); link("2f_e_cab", "2f_e_low2"); link("2f_e_low2", "2f_e_fac");
  link("2f_e_fac", "2f_fac_cabin_e"); link("2f_e_fac", "2f_e_bot"); link("2f_e_bot", "2f_fac_cabin");

  // 3F
  addRoom("3f_m302", "M302", 348, 315, 108, 145, "3f", "room", "lab", false, "pc");
  addRoom("3f_cabin_1", "CABIN 1", 472, 315, 118, 145, "3f", "room", "office");
  addRoom("3f_cabin_2", "CABIN 2", 600, 315, 118, 145, "3f", "room", "office");
  addRoom("3f_teachers", "TEACHER'S CABINS", 955, 315, 145, 145, "3f", "room", "office");
  addRoom("3f_m303", "M303", 175, 535, 195, 145, "3f", "room", "classroom");
  addRoom("3f_m301", "M301", 385, 535, 195, 145, "3f", "room", "classroom");
  addRoom("3f_vc", "VICE CHANCELLOR", 585, 535, 185, 145, "3f", "room", "office");
  addRoom("3f_hpc_lab", "HPC AR/VR LAB", 765, 535, 145, 145, "3f", "room", "lab");
  addRoom("3f_code_lab", "CODE LAB", 945, 520, 175, 115, "3f", "room", "lab");
  addRoom("3f_cabin_g", "CABIN G", 1015, 135, 86, 86, "3f", "room", "office");
  addRoom("3f_cabin_f", "CABIN F", 1195, 135, 110, 86, "3f", "room", "office");
  addRoom("3f_cabin_a", "CABIN A", 1210, 255, 86, 58, "3f", "room", "office");
  addRoom("3f_cabin_c", "CABIN C", 1210, 325, 86, 58, "3f", "room", "office");
  addRoom("3f_east_junc", "EAST JUNCTION", 1210, 420, 96, 64, "3f", "room", "office");
  addRoom("3f_cabin_e", "CABIN E", 1205, 585, 82, 105, "3f", "room", "office");
  addRoom("3f_devanshu", "DEVANSHU TIWARI MAM", 895, 760, 145, 62, "3f", "room", "office");
  addRoom("3f_cabin_j", "CABIN J", 1010, 760, 74, 62, "3f", "room", "office");
  addRoom("3f_cabin_k", "CABIN K", 1095, 760, 76, 62, "3f", "room", "office");
  addCor("3f_c_m302", 348, 420, "3f");
  addCor("3f_c_cab1", 472, 420, "3f");
  addCor("3f_c_cab2", 600, 420, "3f");
  addCor("3f_c_vc", 585, 420, "3f");
  addCor("3f_c_hpc", 765, 420, "3f");
  addCor("3f_c_code", 945, 420, "3f");
  addCor("3f_e_topg", 1015, 200, "3f");
  addCor("3f_e_topj", 1110, 200, "3f");
  addCor("3f_e_caba", 1110, 255, "3f");
  addCor("3f_e_cabc", 1110, 325, "3f");
  addCor("3f_e_cabe", 1110, 585, "3f");
  addCor("3f_s_junc", 1110, 700, "3f");
  addCor("3f_s_j", 1010, 700, "3f");
  addCor("3f_s_dev", 895, 700, "3f");
  link("3f_c_sl", "3f_c_m302"); link("3f_c_m302", "3f_m302"); link("3f_c_m302", "3f_c_mleft");
  link("3f_c_mleft", "3f_m301"); link("3f_c_bw", "3f_m303"); link("3f_c_mleft", "3f_c_cab1");
  link("3f_c_cab1", "3f_cabin_1"); link("3f_c_cab1", "3f_c_mid"); link("3f_c_mid", "3f_c_vc");
  link("3f_c_vc", "3f_vc"); link("3f_c_vc", "3f_c_cab2"); link("3f_c_cab2", "3f_cabin_2");
  link("3f_c_cab2", "3f_c_ent"); link("3f_c_lift", "3f_c_hpc"); link("3f_c_hpc", "3f_hpc_lab");
  link("3f_c_hpc", "3f_c_sr"); link("3f_c_sr", "3f_c_code"); link("3f_c_code", "3f_code_lab");
  link("3f_c_code", "3f_c_mright"); link("3f_c_mright", "3f_teachers"); link("3f_e_top", "3f_cabin_f");
  link("3f_e_top", "3f_e_topj"); link("3f_e_topj", "3f_e_topg"); link("3f_e_topg", "3f_cabin_g");
  link("3f_e_topj", "3f_e_caba"); link("3f_e_caba", "3f_cabin_a"); link("3f_e_caba", "3f_e_cabc");
  link("3f_e_cabc", "3f_cabin_c"); link("3f_e_cabc", "3f_c_ejunc"); link("3f_c_ejunc", "3f_east_junc");
  link("3f_e_low1", "3f_e_cabe"); link("3f_e_cabe", "3f_cabin_e"); link("3f_e_cabe", "3f_s_junc");
  link("3f_s_junc", "3f_cabin_k"); link("3f_s_junc", "3f_s_j"); link("3f_s_j", "3f_cabin_j");
  link("3f_s_j", "3f_s_dev"); link("3f_s_dev", "3f_devanshu");

  return { nodes, edges };
}

function runFallbackDijkstra(startId, endId) {
  const byId = new Map(state.nodes.map((n) => [n.id, n]));
  if (!byId.has(startId) || !byId.has(endId)) {
    return { found: false, error: "Invalid start or destination location." };
  }
  const adj = new Map(state.nodes.map((n) => [n.id, []]));
  for (const e of state.edges) {
    const a = byId.get(e.from);
    const b = byId.get(e.to);
    if (!a || !b) continue;
    const w = e.weight > 0 ? e.weight : Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
    adj.get(a.id).push({ to: b.id, w });
    adj.get(b.id).push({ to: a.id, w });
  }

  const dist = new Map([[startId, 0]]);
  const parent = new Map();
  const visited = new Set();
  const pq = [[0, startId]];

  while (pq.length > 0) {
    pq.sort((x, y) => x[0] - y[0]);
    const [d, u] = pq.shift();
    if (visited.has(u)) continue;
    visited.add(u);
    if (u === endId) break;
    for (const edge of adj.get(u)) {
      if (visited.has(edge.to)) continue;
      const alt = d + edge.w;
      if (alt < (dist.get(edge.to) ?? Infinity)) {
        dist.set(edge.to, alt);
        parent.set(edge.to, u);
        pq.push([alt, edge.to]);
      }
    }
  }

  if (!dist.has(endId)) return { found: false, error: "No connected path found." };

  const path = [];
  for (let cur = endId; cur; cur = parent.get(cur)) path.push(byId.get(cur));
  path.reverse();

  const totalMeters = dist.get(endId) / 12;
  const estimatedSeconds = Math.max(5, Math.round(totalMeters / 1.3));
  const rank = { gf: 0, "1f": 1, "2f": 2, "3f": 3 };
  const instructions = [];
  if (path.length === 1) {
    instructions.push(`You are already at ${path[0].label}.`);
  } else {
    instructions.push(`Start at ${path[0].label} (${FLOOR_NAMES[path[0].floor]}).`);
    for (let i = 1; i < path.length; i++) {
      if (path[i - 1].floor !== path[i].floor) {
        let j = i;
        while (j + 1 < path.length && path[j].floor !== path[j + 1].floor && path[j].type === path[j + 1].type) j++;
        const dir = rank[path[j].floor] > rank[path[i - 1].floor] ? "up" : "down";
        const mode = path[i].type === "lift" ? "Take Lift" : `Take ${path[i].label}`;
        instructions.push(`${mode} ${dir} to ${FLOOR_NAMES[path[j].floor]}.`);
        i = j;
      } else if (i === path.length - 1) {
        instructions.push(`Arrive at ${path[i].label} (${FLOOR_NAMES[path[i].floor]}).`);
      }
    }
  }

  return { found: true, totalMeters, estimatedSeconds, path, instructions };
}

// ---------------- SVG Helpers ----------------
function svgEl(tag, attrs = {}) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs)) {
    node.setAttribute(k, String(v));
  }
  return node;
}

function getNode(id) {
  return state.nodes.find((n) => n.id === id) || null;
}

function getSearchableNodes() {
  return state.nodes.filter((n) => n.type !== "corridor");
}

function formatWalkTime(sec) {
  if (sec < 60) return `${sec} sec walk`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s > 0 ? `${m} min ${s} sec walk` : `${m} min walk`;
}

function wrapLabel(label, maxChars) {
  if (label.length <= maxChars) return [label];
  const words = label.split(" ");
  const lines = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length <= maxChars) {
      cur = (cur + " " + w).trim();
    } else {
      if (cur) lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 3);
}

// ---------------- Data Loading ----------------
async function init() {
  try {
    const res = await fetch("/api/graph");
    if (!res.ok) throw new Error("API unavailable");
    const data = await res.json();
    if (!data.nodes || data.nodes.length === 0) throw new Error("Empty graph");
    state.nodes = data.nodes;
    state.edges = data.edges || [];
    state.usingFallback = false;
  } catch (_) {
    const fb = buildFallbackGraph();
    state.nodes = fb.nodes;
    state.edges = fb.edges;
    state.usingFallback = true;
  }

  const defaultStart = getNode("gf_entrance");
  if (defaultStart) {
    state.startId = defaultStart.id;
    el.startInput.value = `${defaultStart.label} (GF)`;
  }

  renderFloor();
}

// ---------------- Blueprint Rendering ----------------
function renderFloor() {
  const floor = state.currentFloor;
  el.floorWatermark.textContent = FLOOR_TITLES[floor] || floor.toUpperCase();

  el.floorPills.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.floor === floor);
  });

  renderCorridors(floor);
  renderRooms(floor);
  renderRoutePath();
}

function renderCorridors(floor) {
  el.corridorLayer.innerHTML = "";

  // Main horizontal corridor
  el.corridorLayer.appendChild(
    svgEl("rect", {
      x: 74,
      y: 394,
      width: 1062,
      height: 52,
      rx: 10,
      fill: "#1a2438",
      stroke: "rgba(148, 163, 184, 0.1)",
      "stroke-width": 1
    })
  );

  // East vertical corridor
  el.corridorLayer.appendChild(
    svgEl("rect", {
      x: 1084,
      y: 140,
      width: 52,
      height: 620,
      rx: 10,
      fill: "#1a2438",
      stroke: "rgba(148, 163, 184, 0.1)",
      "stroke-width": 1
    })
  );

  if (floor === "gf") {
    el.corridorLayer.appendChild(
      svgEl("rect", {
        x: 590,
        y: 440,
        width: 90,
        height: 270,
        rx: 10,
        fill: "#1a2438",
        stroke: "rgba(148, 163, 184, 0.1)",
        "stroke-width": 1
      })
    );
    const entTxt = svgEl("text", {
      x: 635,
      y: 555,
      fill: "rgba(148, 163, 184, 0.5)",
      "font-size": 12,
      "font-weight": 800,
      "letter-spacing": "0.14em",
      "text-anchor": "middle"
    });
    entTxt.textContent = "ENTRANCE";
    el.corridorLayer.appendChild(entTxt);
  }

  if (floor === "3f") {
    el.corridorLayer.appendChild(
      svgEl("rect", { x: 995, y: 180, width: 140, height: 40, rx: 8, fill: "#1a2438" })
    );
    el.corridorLayer.appendChild(
      svgEl("rect", { x: 840, y: 678, width: 295, height: 44, rx: 8, fill: "#1a2438" })
    );
  }
}

function renderRooms(floor) {
  el.roomLayer.innerHTML = "";
  const rooms = state.nodes.filter((n) => n.floor === floor && n.type !== "corridor");

  for (const r of rooms) {
    const style = CATEGORY_STYLES[r.category] || CATEGORY_STYLES.classroom;
    const isHighlighted = state.highlightedId === r.id;

    const g = svgEl("g", {
      class: `room-group${isHighlighted ? " highlighted" : ""}`,
      "data-id": r.id
    });

    const rx = r.x - r.w / 2;
    const ry = r.y - r.h / 2;

    g.appendChild(
      svgEl("rect", {
        class: "room-rect",
        x: rx,
        y: ry,
        width: r.w,
        height: r.h,
        rx: 10,
        fill: style.fill,
        stroke: style.stroke,
        "stroke-width": 1.8
      })
    );

    if (r.verticalText) {
      const txt = svgEl("text", {
        class: "room-label small",
        x: r.x,
        y: r.y - 10,
        transform: `rotate(90 ${r.x} ${r.y - 10})`
      });
      txt.textContent = r.label;
      g.appendChild(txt);

      if (r.badge === "female" || r.badge === "male") {
        const badgeRect = svgEl("rect", {
          x: r.x - 8,
          y: r.y + r.h / 2 - 26,
          width: 16,
          height: 16,
          rx: 4,
          fill: r.badge === "female" ? "#a855f7" : "#3b82f6"
        });
        const badgeSym = svgEl("text", {
          x: r.x,
          y: r.y + r.h / 2 - 17,
          fill: "#fff",
          "font-size": 10,
          "font-weight": 800,
          "text-anchor": "middle",
          "dominant-baseline": "middle"
        });
        badgeSym.textContent = r.badge === "female" ? "♀" : "♂";
        g.appendChild(badgeRect);
        g.appendChild(badgeSym);
      }
    } else {
      const maxChars = Math.max(8, Math.floor(r.w / 8.2));
      const lines = wrapLabel(r.label, maxChars);
      const lineHeight = 14;
      const startY = r.y - ((lines.length - 1) * lineHeight) / 2;

      lines.forEach((line, idx) => {
        const t = svgEl("text", {
          class: `room-label${r.w < 96 ? " small" : ""}`,
          x: r.x,
          y: startY + idx * lineHeight
        });
        t.textContent = line;
        g.appendChild(t);
      });

      if (r.badge === "pc") {
        const pc = svgEl("text", {
          x: r.x + r.w / 2 - 15,
          y: r.y + r.h / 2 - 14,
          "font-size": 12,
          "text-anchor": "middle"
        });
        pc.textContent = "💻";
        g.appendChild(pc);
      }
    }

    // Clicking a room sets it directly as Target Destination
    g.addEventListener("click", (ev) => {
      ev.stopPropagation();
      if (state.dragMoved) return;
      state.endId = r.id;
      state.highlightedId = r.id;
      el.endInput.value = `${r.label} (${r.floor.toUpperCase()})`;
      el.clearEndBtn.classList.remove("hidden");
      renderRooms(state.currentFloor);
    });

    el.roomLayer.appendChild(g);
  }
}

function renderRoutePath() {
  el.routeLayer.innerHTML = "";
  const route = state.activeRoute;

  ["gf", "1f", "2f", "3f"].forEach((f) => {
    const dot = document.getElementById(`dot-${f}`);
    const hasFloor = route && route.found && route.path.some((p) => p.floor === f);
    dot.classList.toggle("hidden", !hasFloor);
  });

  if (!route || !route.found || route.path.length === 0) return;

  const floor = state.currentFloor;
  const segments = [];
  let curSeg = [];

  for (const pt of route.path) {
    if (pt.floor === floor) {
      curSeg.push(pt);
    } else if (curSeg.length > 0) {
      segments.push(curSeg);
      curSeg = [];
    }
  }
  if (curSeg.length > 0) segments.push(curSeg);

  for (const seg of segments) {
    if (seg.length >= 2) {
      const pointsStr = seg.map((p) => `${p.x},${p.y}`).join(" ");
      el.routeLayer.appendChild(
        svgEl("polyline", { points: pointsStr, class: "nav-path-glow", filter: "url(#neonGlow)" })
      );
      el.routeLayer.appendChild(
        svgEl("polyline", { points: pointsStr, class: "nav-path-dash", filter: "url(#neonGlow)" })
      );
    }
  }

  const firstPt = route.path[0];
  const lastPt = route.path[route.path.length - 1];

  if (firstPt.floor === floor) {
    el.routeLayer.appendChild(
      svgEl("circle", { cx: firstPt.x, cy: firstPt.y, r: 7, fill: "#10b981", stroke: "#fff", "stroke-width": 2.5 })
    );
  }
  if (lastPt.floor === floor) {
    el.routeLayer.appendChild(
      svgEl("circle", {
        cx: lastPt.x,
        cy: lastPt.y,
        r: 8,
        fill: "#38bdf8",
        stroke: "#fff",
        "stroke-width": 2.5,
        filter: "url(#neonGlow)"
      })
    );
  }

  for (let i = 0; i < route.path.length - 1; i++) {
    const a = route.path[i];
    const b = route.path[i + 1];
    if (a.floor === floor && b.floor !== floor) {
      let j = i + 1;
      while (j + 1 < route.path.length && route.path[j + 1].floor !== route.path[j].floor) j++;
      const targetFloor = route.path[j].floor;
      const badgeG = svgEl("g", { class: "floor-jump-pill" });
      badgeG.appendChild(
        svgEl("rect", {
          x: a.x - 36,
          y: a.y - 46,
          width: 72,
          height: 22,
          rx: 11,
          fill: "#f59e0b",
          stroke: "#060b14",
          "stroke-width": 2
        })
      );
      const txt = svgEl("text", {
        x: a.x,
        y: a.y - 34,
        fill: "#04101f",
        "font-size": 10,
        "font-weight": 800,
        "text-anchor": "middle",
        "dominant-baseline": "middle"
      });
      txt.textContent = `GO ${targetFloor.toUpperCase()} ↗`;
      badgeG.appendChild(txt);
      badgeG.addEventListener("click", (ev) => {
        ev.stopPropagation();
        switchFloor(targetFloor);
      });
      el.routeLayer.appendChild(badgeG);
    }
  }
}

// ---------------- Navigation & Search ----------------
async function runNavigation() {
  if (!state.startId || !state.endId) {
    el.routeError.textContent = "Please choose both Start Point and Target Destination.";
    el.routeError.classList.remove("hidden");
    return;
  }
  el.routeError.classList.add("hidden");

  let data;
  if (!state.usingFallback) {
    try {
      const res = await fetch(
        `/api/route?from=${encodeURIComponent(state.startId)}&to=${encodeURIComponent(state.endId)}`
      );
      if (!res.ok) throw new Error("API error");
      data = await res.json();
    } catch (_) {
      data = runFallbackDijkstra(state.startId, state.endId);
    }
  } else {
    data = runFallbackDijkstra(state.startId, state.endId);
  }

  if (!data || !data.found) {
    state.activeRoute = null;
    el.routeCard.classList.add("hidden");
    el.routeError.textContent = (data && data.error) || "No route found.";
    el.routeError.classList.remove("hidden");
    renderRoutePath();
    return;
  }

  state.activeRoute = data;
  state.highlightedId = state.endId;

  el.routeDistance.textContent = `${Math.round(data.totalMeters)} m`;
  el.routeTime.textContent = formatWalkTime(data.estimatedSeconds);

  const floorSeq = [];
  for (const p of data.path) {
    const fUp = p.floor.toUpperCase();
    if (floorSeq[floorSeq.length - 1] !== fUp) floorSeq.push(fUp);
  }
  el.routeFloors.textContent = floorSeq.join(" → ");

  el.routeSteps.innerHTML = "";
  data.instructions.forEach((step, idx) => {
    const li = document.createElement("li");
    li.textContent = step;
    li.addEventListener("click", () => {
      if (idx === 0) switchFloor(data.path[0].floor);
      else if (idx === data.instructions.length - 1) switchFloor(data.path[data.path.length - 1].floor);
      else {
        const transition = data.path.find((p, k) => k > 0 && p.floor !== data.path[k - 1].floor);
        if (transition) switchFloor(transition.floor);
      }
    });
    el.routeSteps.appendChild(li);
  });

  el.routeCard.classList.remove("hidden");
  switchFloor(data.path[0].floor);
}

function stopNavigation() {
  state.activeRoute = null;
  state.highlightedId = null;
  el.routeCard.classList.add("hidden");
  el.routeError.classList.add("hidden");
  renderFloor();
}

function switchFloor(floor) {
  state.currentFloor = floor;
  renderFloor();
}

function bindSearchDropdown(inputEl, dropdownEl, onSelect) {
  function renderMatches(query) {
    const q = query.trim().toLowerCase();
    const matches = getSearchableNodes()
      .filter((n) => !q || n.label.toLowerCase().includes(q) || n.floor.includes(q))
      .slice(0, 14);

    dropdownEl.innerHTML = "";
    if (matches.length === 0) {
      dropdownEl.innerHTML = `<div class="dropdown-item" style="color:var(--text-muted)">No matching rooms</div>`;
    } else {
      for (const n of matches) {
        const item = document.createElement("div");
        item.className = "dropdown-item";
        item.innerHTML = `<span>${n.label}</span><span class="dropdown-floor">${n.floor.toUpperCase()}</span>`;
        item.addEventListener("mousedown", (e) => {
          e.preventDefault();
          dropdownEl.classList.add("hidden");
          onSelect(n);
        });
        dropdownEl.appendChild(item);
      }
    }
    dropdownEl.classList.remove("hidden");
  }

  inputEl.addEventListener("focus", () => renderMatches(inputEl.value));
  inputEl.addEventListener("input", () => renderMatches(inputEl.value));
  inputEl.addEventListener("blur", () => {
    setTimeout(() => dropdownEl.classList.add("hidden"), 150);
  });
}

bindSearchDropdown(el.quickSearchInput, el.quickSearchDropdown, (node) => {
  el.quickSearchInput.value = `${node.label} (${node.floor.toUpperCase()})`;
  el.clearQuickSearch.classList.remove("hidden");
  state.highlightedId = node.id;
  state.endId = node.id;
  el.endInput.value = `${node.label} (${node.floor.toUpperCase()})`;
  el.clearEndBtn.classList.remove("hidden");
  switchFloor(node.floor);
});

bindSearchDropdown(el.startInput, el.startDropdown, (node) => {
  state.startId = node.id;
  el.startInput.value = `${node.label} (${node.floor.toUpperCase()})`;
});

bindSearchDropdown(el.endInput, el.endDropdown, (node) => {
  state.endId = node.id;
  el.endInput.value = `${node.label} (${node.floor.toUpperCase()})`;
  el.clearEndBtn.classList.remove("hidden");
});

// ---------------- Event Listeners ----------------
el.quickSearchInput.addEventListener("input", () => {
  el.clearQuickSearch.classList.toggle("hidden", !el.quickSearchInput.value);
});

el.clearQuickSearch.addEventListener("click", () => {
  el.quickSearchInput.value = "";
  el.clearQuickSearch.classList.add("hidden");
  state.highlightedId = null;
  renderRooms(state.currentFloor);
});

el.endInput.addEventListener("input", () => {
  el.clearEndBtn.classList.toggle("hidden", !el.endInput.value);
});

el.endInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    const q = el.endInput.value.trim().toLowerCase();
    const first = getSearchableNodes().find((n) => n.label.toLowerCase().includes(q));
    if (first) {
      state.endId = first.id;
      el.endInput.value = `${first.label} (${first.floor.toUpperCase()})`;
      el.endDropdown.classList.add("hidden");
      runNavigation();
    }
  }
});

el.clearEndBtn.addEventListener("click", () => {
  state.endId = "";
  el.endInput.value = "";
  el.clearEndBtn.classList.add("hidden");
  stopNavigation();
});

el.swapBtn.addEventListener("click", () => {
  const tmpId = state.startId;
  const tmpVal = el.startInput.value;
  state.startId = state.endId;
  el.startInput.value = el.endInput.value;
  state.endId = tmpId;
  el.endInput.value = tmpVal;
  el.clearEndBtn.classList.toggle("hidden", !el.endInput.value);
  if (state.startId && state.endId) runNavigation();
});

el.navigateBtn.addEventListener("click", runNavigation);
el.stopNavBtn.addEventListener("click", stopNavigation);

el.floorPills.forEach((btn) => {
  btn.addEventListener("click", () => switchFloor(btn.dataset.floor));
});

// ---------------- Pan & Zoom on SVG Blueprint ----------------
function applyTransform() {
  const { x, y, scale } = state.pan;
  el.viewportGroup.setAttribute("transform", `translate(${x} ${y}) scale(${scale})`);
}

el.floorSvg.addEventListener("wheel", (e) => {
  e.preventDefault();
  const delta = e.deltaY < 0 ? 1.12 : 0.9;
  state.pan.scale = Math.max(0.65, Math.min(2.6, state.pan.scale * delta));
  applyTransform();
});

el.floorSvg.addEventListener("mousedown", (e) => {
  state.dragging = true;
  state.dragMoved = false;
  state.dragStart = { x: e.clientX - state.pan.x, y: e.clientY - state.pan.y };
});

window.addEventListener("mousemove", (e) => {
  if (!state.dragging) return;
  const nx = e.clientX - state.dragStart.x;
  const ny = e.clientY - state.dragStart.y;
  if (Math.hypot(nx - state.pan.x, ny - state.pan.y) > 4) state.dragMoved = true;
  state.pan.x = nx;
  state.pan.y = ny;
  applyTransform();
});

window.addEventListener("mouseup", () => {
  state.dragging = false;
  setTimeout(() => {
    state.dragMoved = false;
  }, 40);
});

init();
