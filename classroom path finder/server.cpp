#define _WIN32_WINNT 0x0601
#ifdef _MSC_VER
#pragma comment(lib, "ws2_32.lib")
#endif

#include <winsock2.h>
#include <ws2tcpip.h>

#include <algorithm>
#include <cctype>
#include <cmath>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <limits>
#include <queue>
#include <sstream>
#include <string>
#include <unordered_map>
#include <utility>
#include <vector>

// ============================================================================
// MITS NAV — 4-Floor Campus Graph & C++ Dijkstra Shortest-Path Engine
// Coordinate space: SVG viewBox 0..1320 (width) x 0..840 (height)
// ============================================================================

struct Node {
    std::string id;
    std::string label;
    double x = 0.0;
    double y = 0.0;
    std::string floor;     // "gf", "1f", "2f", "3f"
    std::string type;      // "room", "corridor", "lift", "stair", "entrance"
    std::string category;  // "lab", "classroom", "office", "utility", "corridor"
    double w = 120.0;
    double h = 110.0;
    bool verticalText = false;
    std::string badge;     // optional icon hint: "pc", "female", "male"
};

struct Edge {
    std::string from;
    std::string to;
    double weight = 0.0;
    bool isVertical = false;
};

struct AdjEntry {
    int toIndex;
    double weight;
    bool isVertical;
};

class CampusGraph {
public:
    std::vector<Node> nodes;
    std::vector<Edge> edges;
    std::unordered_map<std::string, int> idToIndex;
    std::vector<std::vector<AdjEntry>> adj;

    void loadDefault() {
        nodes.clear();
        edges.clear();

        auto addRoom = [&](const std::string& id, const std::string& label,
                           double x, double y, double w, double h,
                           const std::string& floor, const std::string& type,
                           const std::string& cat, bool vText = false,
                           const std::string& badge = "") {
            nodes.push_back({id, label, x, y, floor, type, cat, w, h, vText, badge});
        };

        auto addCor = [&](const std::string& id, double x, double y, const std::string& floor) {
            nodes.push_back({id, "Corridor", x, y, floor, "corridor", "corridor", 0, 0, false, ""});
        };

        auto link = [&](const std::string& a, const std::string& b, double customW = 0.0, bool vert = false) {
            edges.push_back({a, b, customW, vert});
        };

        // Shared corridor geometry constants (SVG coordinates: y=0 top, y=840 bottom)
        // Main horizontal corridor centerline: y = 420
        // East vertical corridor centerline:   x = 1110
        const std::vector<std::string> floors = {"gf", "1f", "2f", "3f"};

        for (const auto& f : floors) {
            // Shared West-wing utilities & vertical shafts across all 4 floors
            addRoom(f + "_girls_washroom", "GIRLS WASHROOM", 105, 290, 56, 195, f, "room", "utility", true, "female");
            addRoom(f + "_boys_washroom",  "BOYS WASHROOM",  169, 290, 56, 195, f, "room", "utility", true, "male");
            addRoom(f + "_stairs_left",    "STAIRS LEFT",    246, 315, 84, 145, f, "stair", "utility");
            addRoom(f + "_lift",           "LIFT",           750, 315, 76, 145, f, "lift", "utility");
            addRoom(f + "_stairs_right",   "STAIRS RIGHT",   834, 315, 78, 145, f, "stair", "utility");

            // Shared orthogonal corridor spine nodes (guarantee clean 90-degree paths)
            addCor(f + "_c_gw",    105, 420, f);
            addCor(f + "_c_bw",    169, 420, f);
            addCor(f + "_c_sl",    246, 420, f);
            addCor(f + "_c_mleft", 365, 420, f);
            addCor(f + "_c_mid",   500, 420, f);
            addCor(f + "_c_ent",   635, 420, f);
            addCor(f + "_c_lift",  750, 420, f);
            addCor(f + "_c_sr",    834, 420, f);
            addCor(f + "_c_mright",955, 420, f);
            addCor(f + "_c_ejunc", 1110, 420, f);

            // East vertical corridor spine nodes
            addCor(f + "_e_top",   1110, 145, f);
            addCor(f + "_e_upper", 1110, 275, f);
            addCor(f + "_e_low1",  1110, 535, f);
            addCor(f + "_e_low2",  1110, 625, f);
            addCor(f + "_e_bot",   1110, 725, f);

            // Connect horizontal spine
            link(f + "_c_gw",     f + "_c_bw");
            link(f + "_c_bw",     f + "_c_sl");
            link(f + "_c_sl",     f + "_c_mleft");
            link(f + "_c_mleft",  f + "_c_mid");
            link(f + "_c_mid",    f + "_c_ent");
            link(f + "_c_ent",    f + "_c_lift");
            link(f + "_c_lift",   f + "_c_sr");
            link(f + "_c_sr",     f + "_c_mright");
            link(f + "_c_mright", f + "_c_ejunc");

            // Connect east vertical spine
            link(f + "_e_top",   f + "_e_upper");
            link(f + "_e_upper", f + "_c_ejunc");
            link(f + "_c_ejunc", f + "_e_low1");
            link(f + "_e_low1",  f + "_e_low2");
            link(f + "_e_low2",  f + "_e_bot");

            // Connect shared utilities to main corridor
            link(f + "_girls_washroom", f + "_c_gw");
            link(f + "_boys_washroom",  f + "_c_bw");
            link(f + "_stairs_left",    f + "_c_sl");
            link(f + "_lift",           f + "_c_lift");
            link(f + "_stairs_right",   f + "_c_sr");
        }

        // Vertical floor-to-floor links (Lift is slightly faster than Stairs)
        for (size_t i = 0; i + 1 < floors.size(); ++i) {
            const std::string& cur = floors[i];
            const std::string& nxt = floors[i + 1];
            link(cur + "_lift",         nxt + "_lift",         80.0,  true);
            link(cur + "_stairs_left",  nxt + "_stairs_left",  130.0, true);
            link(cur + "_stairs_right", nxt + "_stairs_right", 130.0, true);
        }

        // ---------------- GROUND FLOOR (GF) ----------------
        addRoom("gf_m004",         "M004",              385, 315, 175, 145, "gf", "room", "lab", false, "pc");
        addRoom("gf_m001",         "M001",              960, 315, 150, 145, "gf", "room", "lab");
        addRoom("gf_m005",         "M005",              175, 535, 195, 145, "gf", "room", "classroom");
        addRoom("gf_m003",         "M003",              385, 535, 195, 145, "gf", "room", "classroom");
        addRoom("gf_entrance",     "MAIN ENTRANCE",     635, 650, 118, 120, "gf", "entrance", "classroom");
        addRoom("gf_m002",         "M002",              755, 535, 105, 145, "gf", "room", "classroom");
        addRoom("gf_m007",         "M007 C-IOT LAB",    880, 535, 125, 145, "gf", "room", "lab", false, "pc");
        addRoom("gf_hod_office",   "HOD OFFICE",        1005, 505, 88, 105, "gf", "room", "office");

        addRoom("gf_top_cabin",    "TOP CABIN",         1110, 125, 130, 85,  "gf", "room", "office");
        addRoom("gf_cabin_c",      "CABIN C",           1210, 275, 86,  68,  "gf", "room", "office");
        addRoom("gf_east_junc",    "EAST JUNCTION",     1210, 420, 96,  64,  "gf", "room", "office");
        addRoom("gf_cabin_e",      "CABIN E",           1020, 595, 76,  54,  "gf", "room", "office");
        addRoom("gf_fac_cabin_e",  "FACULTY CABIN (E)", 1015, 668, 92,  54,  "gf", "room", "office");
        addRoom("gf_cabin_d",      "CABIN D",           1200, 595, 76,  54,  "gf", "room", "office");
        addRoom("gf_fac_cabin_d",  "FACULTY CABIN (D)", 1205, 668, 92,  54,  "gf", "room", "office");
        addRoom("gf_bottom_cabin", "BOTTOM CABIN",      1110, 755, 106, 56,  "gf", "room", "office");

        addCor("gf_c_m002", 755, 420, "gf");
        addCor("gf_c_m007", 880, 420, "gf");
        addCor("gf_c_hod",  1005, 420, "gf");
        addCor("gf_e_m001", 1110, 315, "gf");
        addCor("gf_e_fac",  1110, 668, "gf");
        addCor("gf_e_cab",  1110, 595, "gf");

        link("gf_c_mleft", "gf_m004");
        link("gf_c_mleft", "gf_m003");
        link("gf_c_bw",    "gf_m005");
        link("gf_c_ent",   "gf_entrance");
        link("gf_c_lift",  "gf_c_m002");
        link("gf_c_m002",  "gf_m002");
        link("gf_c_m002",  "gf_c_sr");
        link("gf_c_sr",    "gf_c_m007");
        link("gf_c_m007",  "gf_m007");
        link("gf_c_m007",  "gf_c_mright");
        link("gf_c_mright","gf_m001");
        link("gf_c_mright","gf_c_hod");
        link("gf_c_hod",   "gf_hod_office");
        link("gf_c_hod",   "gf_c_ejunc");

        link("gf_e_top",   "gf_top_cabin");
        link("gf_e_upper", "gf_cabin_c");
        link("gf_c_ejunc", "gf_east_junc");
        link("gf_e_low1",  "gf_e_cab");
        link("gf_e_cab",   "gf_cabin_e");
        link("gf_e_cab",   "gf_cabin_d");
        link("gf_e_cab",   "gf_e_low2");
        link("gf_e_low2",  "gf_e_fac");
        link("gf_e_fac",   "gf_fac_cabin_e");
        link("gf_e_fac",   "gf_fac_cabin_d");
        link("gf_e_fac",   "gf_e_bot");
        link("gf_e_bot",   "gf_bottom_cabin");

        // ---------------- FIRST FLOOR (1F) ----------------
        addRoom("1f_m104",         "M104",              395, 315, 195, 145, "1f", "room", "lab");
        addRoom("1f_m101",         "M101",              960, 315, 150, 145, "1f", "room", "lab");
        addRoom("1f_m105",         "M105",              175, 535, 195, 145, "1f", "room", "classroom");
        addRoom("1f_m103",         "M103",              385, 535, 195, 145, "1f", "room", "classroom");
        addRoom("1f_m102",         "M102",              775, 535, 165, 145, "1f", "room", "classroom");
        addRoom("1f_hod_office",   "HOD OFFICE",        970, 505, 118, 105, "1f", "room", "office");

        addRoom("1f_cabin_a",      "CABIN A",           1210, 215, 86,  64,  "1f", "room", "office");
        addRoom("1f_east_junc",    "EAST JUNCTION",     1210, 420, 96,  64,  "1f", "room", "office");
        addRoom("1f_cabin_e",      "CABIN E",           1020, 595, 76,  54,  "1f", "room", "office");
        addRoom("1f_fac_cabin_e",  "FACULTY CABIN (E)", 1015, 668, 92,  54,  "1f", "room", "office");
        addRoom("1f_bottom_cabin", "BOTTOM END CABIN",  1110, 755, 118, 56,  "1f", "room", "office");

        addCor("1f_c_m102", 775, 420, "1f");
        addCor("1f_c_hod",  970, 420, "1f");
        addCor("1f_e_caba", 1110, 215, "1f");
        addCor("1f_e_cab",  1110, 595, "1f");
        addCor("1f_e_fac",  1110, 668, "1f");

        link("1f_c_mleft", "1f_m104");
        link("1f_c_mleft", "1f_m103");
        link("1f_c_bw",    "1f_m105");
        link("1f_c_lift",  "1f_c_m102");
        link("1f_c_m102",  "1f_m102");
        link("1f_c_m102",  "1f_c_sr");
        link("1f_c_mright","1f_m101");
        link("1f_c_mright","1f_c_hod");
        link("1f_c_hod",   "1f_hod_office");
        link("1f_c_hod",   "1f_c_ejunc");

        link("1f_e_top",   "1f_e_caba");
        link("1f_e_caba",  "1f_cabin_a");
        link("1f_e_caba",  "1f_e_upper");
        link("1f_c_ejunc", "1f_east_junc");
        link("1f_e_low1",  "1f_e_cab");
        link("1f_e_cab",   "1f_cabin_e");
        link("1f_e_cab",   "1f_e_low2");
        link("1f_e_low2",  "1f_e_fac");
        link("1f_e_fac",   "1f_fac_cabin_e");
        link("1f_e_fac",   "1f_e_bot");
        link("1f_e_bot",   "1f_bottom_cabin");

        // ---------------- SECOND FLOOR (2F) ----------------
        addRoom("2f_m204",         "M204",                       345, 315, 100, 145, "2f", "room", "classroom");
        addRoom("2f_drc",          "DATA RESEARCH CENTRE",       550, 315, 270, 145, "2f", "room", "lab");
        addRoom("2f_m201",         "M201",                       960, 315, 150, 145, "2f", "room", "classroom");
        addRoom("2f_m205",         "M205",                       175, 535, 195, 145, "2f", "room", "classroom");
        addRoom("2f_m203",         "M203",                       385, 535, 195, 145, "2f", "room", "classroom");
        addRoom("2f_pvc",          "PRO-VICE CHANCELLOR OFFICE", 590, 535, 195, 145, "2f", "room", "office");
        addRoom("2f_m202",         "M202",                       770, 535, 130, 145, "2f", "room", "classroom");
        addRoom("2f_hod_office",   "HOD OFFICE",                 965, 505, 145, 105, "2f", "room", "office");

        addRoom("2f_acad_sec",     "ACADEMIC SECTION",           1110, 145, 140, 82,  "2f", "room", "classroom");
        addRoom("2f_cabin_a",      "CABIN A",                    1210, 240, 86,  62,  "2f", "room", "office");
        addRoom("2f_east_junc",    "EAST JUNCTION",              1210, 420, 96,  64,  "2f", "room", "office");
        addRoom("2f_cabin_e",      "CABIN E",                    1020, 595, 76,  54,  "2f", "room", "office");
        addRoom("2f_fac_cabin_e",  "FACULTY CABIN (E)",          1015, 668, 92,  54,  "2f", "room", "office");
        addRoom("2f_cabin_d",      "CABIN D",                    1200, 595, 76,  54,  "2f", "room", "office");
        addRoom("2f_fac_cabin",    "FACULTY CABIN",              1110, 755, 112, 56,  "2f", "room", "office");

        addCor("2f_c_m204", 345, 420, "2f");
        addCor("2f_c_drc",  550, 420, "2f");
        addCor("2f_c_pvc",  590, 420, "2f");
        addCor("2f_c_m202", 770, 420, "2f");
        addCor("2f_c_hod",  965, 420, "2f");
        addCor("2f_e_caba", 1110, 240, "2f");
        addCor("2f_e_cab",  1110, 595, "2f");
        addCor("2f_e_fac",  1110, 668, "2f");

        link("2f_c_sl",    "2f_c_m204");
        link("2f_c_m204",  "2f_m204");
        link("2f_c_m204",  "2f_c_mleft");
        link("2f_c_mleft", "2f_m203");
        link("2f_c_bw",    "2f_m205");
        link("2f_c_mid",   "2f_c_drc");
        link("2f_c_drc",   "2f_drc");
        link("2f_c_drc",   "2f_c_pvc");
        link("2f_c_pvc",   "2f_pvc");
        link("2f_c_pvc",   "2f_c_ent");
        link("2f_c_lift",  "2f_c_m202");
        link("2f_c_m202",  "2f_m202");
        link("2f_c_m202",  "2f_c_sr");
        link("2f_c_mright","2f_m201");
        link("2f_c_mright","2f_c_hod");
        link("2f_c_hod",   "2f_hod_office");
        link("2f_c_hod",   "2f_c_ejunc");

        link("2f_e_top",   "2f_acad_sec");
        link("2f_e_top",   "2f_e_caba");
        link("2f_e_caba",  "2f_cabin_a");
        link("2f_e_caba",  "2f_e_upper");
        link("2f_c_ejunc", "2f_east_junc");
        link("2f_e_low1",  "2f_e_cab");
        link("2f_e_cab",   "2f_cabin_e");
        link("2f_e_cab",   "2f_cabin_d");
        link("2f_e_cab",   "2f_e_low2");
        link("2f_e_low2",  "2f_e_fac");
        link("2f_e_fac",   "2f_fac_cabin_e");
        link("2f_e_fac",   "2f_e_bot");
        link("2f_e_bot",   "2f_fac_cabin");

        // ---------------- THIRD FLOOR (3F) ----------------
        addRoom("3f_m302",         "M302",              348, 315, 108, 145, "3f", "room", "lab", false, "pc");
        addRoom("3f_cabin_1",      "CABIN 1",           472, 315, 118, 145, "3f", "room", "office");
        addRoom("3f_cabin_2",      "CABIN 2",           600, 315, 118, 145, "3f", "room", "office");
        addRoom("3f_teachers",     "TEACHER'S CABINS",  955, 315, 145, 145, "3f", "room", "office");
        addRoom("3f_m303",         "M303",              175, 535, 195, 145, "3f", "room", "classroom");
        addRoom("3f_m301",         "M301",              385, 535, 195, 145, "3f", "room", "classroom");
        addRoom("3f_vc",           "VICE CHANCELLOR",   585, 535, 185, 145, "3f", "room", "office");
        addRoom("3f_hpc_lab",      "HPC AR/VR LAB",     765, 535, 145, 145, "3f", "room", "lab");
        addRoom("3f_code_lab",     "CODE LAB",          945, 520, 175, 115, "3f", "room", "lab");

        addRoom("3f_cabin_g",      "CABIN G",           1015, 135, 86,  86,  "3f", "room", "office");
        addRoom("3f_cabin_f",      "CABIN F",           1195, 135, 110, 86,  "3f", "room", "office");
        addRoom("3f_cabin_a",      "CABIN A",           1210, 255, 86,  58,  "3f", "room", "office");
        addRoom("3f_cabin_c",      "CABIN C",           1210, 325, 86,  58,  "3f", "room", "office");
        addRoom("3f_east_junc",    "EAST JUNCTION",     1210, 420, 96,  64,  "3f", "room", "office");
        addRoom("3f_cabin_e",      "CABIN E",           1205, 585, 82,  105, "3f", "room", "office");
        addRoom("3f_devanshu",     "DEVANSHU TIWARI MAM", 895, 760, 145, 62, "3f", "room", "office");
        addRoom("3f_cabin_j",      "CABIN J",           1010, 760, 74,  62,  "3f", "room", "office");
        addRoom("3f_cabin_k",      "CABIN K",           1095, 760, 76,  62,  "3f", "room", "office");

        addCor("3f_c_m302",  348, 420, "3f");
        addCor("3f_c_cab1",  472, 420, "3f");
        addCor("3f_c_cab2",  600, 420, "3f");
        addCor("3f_c_vc",    585, 420, "3f");
        addCor("3f_c_hpc",   765, 420, "3f");
        addCor("3f_c_code",  945, 420, "3f");
        addCor("3f_e_topg",  1015, 200, "3f");
        addCor("3f_e_topj",  1110, 200, "3f");
        addCor("3f_e_caba",  1110, 255, "3f");
        addCor("3f_e_cabc",  1110, 325, "3f");
        addCor("3f_e_cabe",  1110, 585, "3f");
        addCor("3f_s_junc",  1110, 700, "3f");
        addCor("3f_s_j",     1010, 700, "3f");
        addCor("3f_s_dev",   895, 700, "3f");

        link("3f_c_sl",    "3f_c_m302");
        link("3f_c_m302",  "3f_m302");
        link("3f_c_m302",  "3f_c_mleft");
        link("3f_c_mleft", "3f_m301");
        link("3f_c_bw",    "3f_m303");
        link("3f_c_mleft", "3f_c_cab1");
        link("3f_c_cab1",  "3f_cabin_1");
        link("3f_c_cab1",  "3f_c_mid");
        link("3f_c_mid",   "3f_c_vc");
        link("3f_c_vc",    "3f_vc");
        link("3f_c_vc",    "3f_c_cab2");
        link("3f_c_cab2",  "3f_cabin_2");
        link("3f_c_cab2",  "3f_c_ent");
        link("3f_c_lift",  "3f_c_hpc");
        link("3f_c_hpc",   "3f_hpc_lab");
        link("3f_c_hpc",   "3f_c_sr");
        link("3f_c_sr",    "3f_c_code");
        link("3f_c_code",  "3f_code_lab");
        link("3f_c_code",  "3f_c_mright");
        link("3f_c_mright","3f_teachers");

        // Top east wing (Cabin G & Cabin F)
        link("3f_e_top",  "3f_cabin_f");
        link("3f_e_top",  "3f_e_topj");
        link("3f_e_topj", "3f_e_topg");
        link("3f_e_topg", "3f_cabin_g");
        link("3f_e_topj", "3f_e_caba");
        link("3f_e_caba", "3f_cabin_a");
        link("3f_e_caba", "3f_e_cabc");
        link("3f_e_cabc", "3f_cabin_c");
        link("3f_e_cabc", "3f_c_ejunc");
        link("3f_c_ejunc","3f_east_junc");

        // Lower east wing & south spur (Cabin E, Devanshu Tiwari Mam, Cabin J, Cabin K)
        link("3f_e_low1", "3f_e_cabe");
        link("3f_e_cabe", "3f_cabin_e");
        link("3f_e_cabe", "3f_s_junc");
        link("3f_s_junc", "3f_cabin_k");
        link("3f_s_junc", "3f_s_j");
        link("3f_s_j",    "3f_cabin_j");
        link("3f_s_j",    "3f_s_dev");
        link("3f_s_dev",  "3f_devanshu");

        rebuild();
    }

    void rebuild() {
        idToIndex.clear();
        for (int i = 0; i < static_cast<int>(nodes.size()); ++i) {
            idToIndex[nodes[i].id] = i;
        }
        adj.assign(nodes.size(), {});

        for (auto& e : edges) {
            auto itA = idToIndex.find(e.from);
            auto itB = idToIndex.find(e.to);
            if (itA == idToIndex.end() || itB == idToIndex.end()) continue;

            int u = itA->second;
            int v = itB->second;
            const Node& na = nodes[u];
            const Node& nb = nodes[v];

            bool crossFloor = (na.floor != nb.floor);
            e.isVertical = e.isVertical || crossFloor;

            double w = e.weight;
            if (w <= 0.0) {
                double dx = na.x - nb.x;
                double dy = na.y - nb.y;
                w = std::max(1.0, std::sqrt(dx * dx + dy * dy));
                e.weight = w;
            }

            adj[u].push_back({v, w, e.isVertical});
            adj[v].push_back({u, w, e.isVertical});
        }
    }

    struct RouteResult {
        bool found = false;
        std::string error;
        double totalDistance = 0.0;
        int visitedCount = 0;
        std::vector<int> pathIndices;
        std::vector<std::string> instructions;
    };

    // Standard Dijkstra's Algorithm with min-heap priority queue: O((V + E) log V)
    RouteResult findShortestPath(const std::string& startId, const std::string& endId) const {
        RouteResult res;
        auto itStart = idToIndex.find(startId);
        auto itEnd = idToIndex.find(endId);
        if (itStart == idToIndex.end() || itEnd == idToIndex.end()) {
            res.error = "Invalid start or destination location.";
            return res;
        }

        int n = static_cast<int>(nodes.size());
        int start = itStart->second;
        int goal = itEnd->second;

        const double INF = std::numeric_limits<double>::infinity();
        std::vector<double> dist(n, INF);
        std::vector<int> parent(n, -1);
        std::vector<bool> settled(n, false);

        using PQItem = std::pair<double, int>;
        std::priority_queue<PQItem, std::vector<PQItem>, std::greater<PQItem>> pq;

        dist[start] = 0.0;
        pq.push({0.0, start});

        while (!pq.empty()) {
            auto [d, u] = pq.top();
            pq.pop();

            if (settled[u]) continue;
            settled[u] = true;
            res.visitedCount++;

            if (u == goal) break;

            for (const auto& edge : adj[u]) {
                int v = edge.toIndex;
                if (settled[v]) continue;

                double alt = d + edge.weight;
                if (alt < dist[v]) {
                    dist[v] = alt;
                    parent[v] = u;
                    pq.push({alt, v});
                }
            }
        }

        if (!std::isfinite(dist[goal])) {
            res.error = "No connected path exists between these locations.";
            return res;
        }

        res.found = true;
        res.totalDistance = dist[goal];

        for (int cur = goal; cur != -1; cur = parent[cur]) {
            res.pathIndices.push_back(cur);
        }
        std::reverse(res.pathIndices.begin(), res.pathIndices.end());

        buildInstructions(res);
        return res;
    }

private:
    static std::string floorName(const std::string& f) {
        if (f == "gf") return "Ground Floor";
        if (f == "1f") return "First Floor";
        if (f == "2f") return "Second Floor";
        if (f == "3f") return "Third Floor";
        return f;
    }

    static int floorRank(const std::string& f) {
        if (f == "gf") return 0;
        if (f == "1f") return 1;
        if (f == "2f") return 2;
        if (f == "3f") return 3;
        return 0;
    }

    void buildInstructions(RouteResult& res) const {
        if (res.pathIndices.empty()) return;
        const Node& first = nodes[res.pathIndices[0]];
        if (res.pathIndices.size() == 1) {
            res.instructions.push_back("You are already at " + first.label + ".");
            return;
        }

        res.instructions.push_back("Start at " + first.label + " (" + floorName(first.floor) + ").");

        for (size_t i = 1; i < res.pathIndices.size(); ++i) {
            const Node& prev = nodes[res.pathIndices[i - 1]];
            const Node& curr = nodes[res.pathIndices[i]];

            if (prev.floor != curr.floor) {
                // Coalesce consecutive lift/stair steps into one clear floor-change instruction
                size_t j = i;
                while (j + 1 < res.pathIndices.size() &&
                       nodes[res.pathIndices[j]].floor != nodes[res.pathIndices[j + 1]].floor &&
                       nodes[res.pathIndices[j]].type == nodes[res.pathIndices[j + 1]].type) {
                    ++j;
                }
                const Node& destFloorNode = nodes[res.pathIndices[j]];
                std::string dir = (floorRank(destFloorNode.floor) > floorRank(prev.floor)) ? "up" : "down";
                std::string mode = (curr.type == "lift") ? "Take Lift " : "Take " + curr.label + " ";
                res.instructions.push_back(mode + dir + " to " + floorName(destFloorNode.floor) + ".");
                i = j;
            } else if (i == res.pathIndices.size() - 1) {
                res.instructions.push_back("Arrive at " + curr.label + " (" + floorName(curr.floor) + ").");
            }
        }
    }
};

// ============================================================================
// JSON Serialization & HTTP Server Helpers
// ============================================================================

std::string jsonEscape(const std::string& s) {
    std::string out;
    out.reserve(s.size() + 8);
    for (char c : s) {
        switch (c) {
            case '"': out += "\\\""; break;
            case '\\': out += "\\\\"; break;
            case '\n': out += "\\n"; break;
            case '\r': out += "\\r"; break;
            case '\t': out += "\\t"; break;
            default: out += c; break;
        }
    }
    return out;
}

std::string graphToJson(const CampusGraph& g) {
    std::ostringstream os;
    os << std::fixed << std::setprecision(1);
    os << "{\"nodes\":[";
    for (size_t i = 0; i < g.nodes.size(); ++i) {
        const auto& n = g.nodes[i];
        if (i > 0) os << ",";
        os << "{"
           << "\"id\":\"" << jsonEscape(n.id) << "\","
           << "\"label\":\"" << jsonEscape(n.label) << "\","
           << "\"x\":" << n.x << ","
           << "\"y\":" << n.y << ","
           << "\"floor\":\"" << jsonEscape(n.floor) << "\","
           << "\"type\":\"" << jsonEscape(n.type) << "\","
           << "\"category\":\"" << jsonEscape(n.category) << "\","
           << "\"w\":" << n.w << ","
           << "\"h\":" << n.h << ","
           << "\"verticalText\":" << (n.verticalText ? "true" : "false") << ","
           << "\"badge\":\"" << jsonEscape(n.badge) << "\""
           << "}";
    }
    os << "],\"edges\":[";
    for (size_t i = 0; i < g.edges.size(); ++i) {
        const auto& e = g.edges[i];
        if (i > 0) os << ",";
        os << "{"
           << "\"from\":\"" << jsonEscape(e.from) << "\","
           << "\"to\":\"" << jsonEscape(e.to) << "\","
           << "\"weight\":" << e.weight << ","
           << "\"isVertical\":" << (e.isVertical ? "true" : "false")
           << "}";
    }
    os << "]}";
    return os.str();
}

std::string routeToJson(const CampusGraph& g, const CampusGraph::RouteResult& r) {
    std::ostringstream os;
    os << std::fixed << std::setprecision(1);
    if (!r.found) {
        os << "{\"found\":false,\"error\":\"" << jsonEscape(r.error) << "\"}";
        return os.str();
    }

    // Approx 12 SVG units ~= 1 meter
    double meters = r.totalDistance / 12.0;
    int walkSeconds = std::max(5, static_cast<int>(std::round(meters / 1.3)));

    os << "{"
       << "\"found\":true,"
       << "\"algorithm\":\"Dijkstra\","
       << "\"totalMeters\":" << meters << ","
       << "\"estimatedSeconds\":" << walkSeconds << ","
       << "\"visitedCount\":" << r.visitedCount << ","
       << "\"path\":[";

    for (size_t i = 0; i < r.pathIndices.size(); ++i) {
        const auto& n = g.nodes[r.pathIndices[i]];
        if (i > 0) os << ",";
        os << "{"
           << "\"id\":\"" << jsonEscape(n.id) << "\","
           << "\"label\":\"" << jsonEscape(n.label) << "\","
           << "\"x\":" << n.x << ","
           << "\"y\":" << n.y << ","
           << "\"floor\":\"" << jsonEscape(n.floor) << "\","
           << "\"type\":\"" << jsonEscape(n.type) << "\""
           << "}";
    }

    os << "],\"instructions\":[";
    for (size_t i = 0; i < r.instructions.size(); ++i) {
        if (i > 0) os << ",";
        os << "\"" << jsonEscape(r.instructions[i]) << "\"";
    }
    os << "]}";
    return os.str();
}

std::string urlDecode(const std::string& s) {
    std::string out;
    for (size_t i = 0; i < s.size(); ++i) {
        if (s[i] == '%' && i + 2 < s.size()) {
            int val = 0;
            std::istringstream iss(s.substr(i + 1, 2));
            if (iss >> std::hex >> val) {
                out += static_cast<char>(val);
                i += 2;
                continue;
            }
        } else if (s[i] == '+') {
            out += ' ';
            continue;
        }
        out += s[i];
    }
    return out;
}

std::unordered_map<std::string, std::string> parseQuery(const std::string& query) {
    std::unordered_map<std::string, std::string> params;
    std::istringstream iss(query);
    std::string pair;
    while (std::getline(iss, pair, '&')) {
        size_t eq = pair.find('=');
        if (eq != std::string::npos) {
            params[urlDecode(pair.substr(0, eq))] = urlDecode(pair.substr(eq + 1));
        }
    }
    return params;
}

bool readFileBytes(const std::string& path, std::string& content) {
    std::ifstream file(path, std::ios::binary);
    if (!file.is_open()) return false;
    std::ostringstream ss;
    ss << file.rdbuf();
    content = ss.str();
    return true;
}

std::string getMimeType(const std::string& path) {
    auto endsWith = [&](const std::string& ext) {
        return path.size() >= ext.size() &&
               path.compare(path.size() - ext.size(), ext.size(), ext) == 0;
    };
    if (endsWith(".html")) return "text/html; charset=utf-8";
    if (endsWith(".css")) return "text/css; charset=utf-8";
    if (endsWith(".js")) return "application/javascript; charset=utf-8";
    if (endsWith(".json")) return "application/json; charset=utf-8";
    return "application/octet-stream";
}

void sendHttpResponse(SOCKET client, int statusCode, const std::string& statusText,
                      const std::string& contentType, const std::string& body) {
    std::ostringstream hdr;
    hdr << "HTTP/1.1 " << statusCode << " " << statusText << "\r\n"
        << "Content-Type: " << contentType << "\r\n"
        << "Content-Length: " << body.size() << "\r\n"
        << "Access-Control-Allow-Origin: *\r\n"
        << "Cache-Control: no-cache\r\n"
        << "Connection: close\r\n\r\n";

    std::string full = hdr.str() + body;
    size_t sent = 0;
    while (sent < full.size()) {
        int n = send(client, full.data() + sent, static_cast<int>(full.size() - sent), 0);
        if (n <= 0) break;
        sent += static_cast<size_t>(n);
    }
}

bool readHttpRequest(SOCKET client, std::string& method, std::string& target) {
    std::string raw;
    char buf[4096];
    size_t headerEnd = std::string::npos;

    while (headerEnd == std::string::npos) {
        int n = recv(client, buf, sizeof(buf), 0);
        if (n <= 0) return false;
        raw.append(buf, n);
        headerEnd = raw.find("\r\n\r\n");
        if (raw.size() > 65536) return false;
    }

    std::istringstream hs(raw.substr(0, headerEnd));
    std::string version;
    return static_cast<bool>(hs >> method >> target >> version);
}

int main(int argc, char* argv[]) {
    int port = 8080;
    if (argc > 1) {
        try { port = std::stoi(argv[1]); } catch (...) { port = 8080; }
    }

    CampusGraph graph;
    graph.loadDefault();

    WSADATA wsaData;
    if (WSAStartup(MAKEWORD(2, 2), &wsaData) != 0) {
        std::cerr << "WSAStartup failed.\n";
        return 1;
    }

    SOCKET serverSock = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
    if (serverSock == INVALID_SOCKET) {
        WSACleanup();
        return 1;
    }

    BOOL opt = TRUE;
    setsockopt(serverSock, SOL_SOCKET, SO_REUSEADDR, reinterpret_cast<const char*>(&opt), sizeof(opt));

    sockaddr_in addr{};
    addr.sin_family = AF_INET;
    addr.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
    addr.sin_port = htons(static_cast<u_short>(port));

    if (bind(serverSock, reinterpret_cast<sockaddr*>(&addr), sizeof(addr)) == SOCKET_ERROR ||
        listen(serverSock, SOMAXCONN) == SOCKET_ERROR) {
        std::cerr << "Failed to bind/listen on port " << port << ".\n";
        closesocket(serverSock);
        WSACleanup();
        return 1;
    }

    std::cout << "Classroom Path Finder (C++ Dijkstra Server) running at http://127.0.0.1:" << port << "/\n";

    while (true) {
        SOCKET client = accept(serverSock, nullptr, nullptr);
        if (client == INVALID_SOCKET) continue;

        std::string method, target;
        if (!readHttpRequest(client, method, target)) {
            closesocket(client);
            continue;
        }

        std::string path = target;
        std::string query;
        size_t qPos = target.find('?');
        if (qPos != std::string::npos) {
            path = target.substr(0, qPos);
            query = target.substr(qPos + 1);
        }

        if (method == "GET" && path == "/api/graph") {
            sendHttpResponse(client, 200, "OK", "application/json; charset=utf-8", graphToJson(graph));
        } else if (method == "GET" && path == "/api/route") {
            auto params = parseQuery(query);
            auto result = graph.findShortestPath(params["from"], params["to"]);
            sendHttpResponse(client, 200, "OK", "application/json; charset=utf-8", routeToJson(graph, result));
        } else if (method == "GET") {
            std::string filePath;
            if (path == "/" || path == "/index.html") filePath = "index.html";
            else if (path == "/style.css") filePath = "style.css";
            else if (path == "/app.js") filePath = "app.js";

            std::string fileData;
            if (!filePath.empty() && readFileBytes(filePath, fileData)) {
                sendHttpResponse(client, 200, "OK", getMimeType(filePath), fileData);
            } else {
                sendHttpResponse(client, 404, "Not Found", "text/plain", "Not Found");
            }
        } else {
            sendHttpResponse(client, 405, "Method Not Allowed", "text/plain", "Method Not Allowed");
        }

        closesocket(client);
    }

    closesocket(serverSock);
    WSACleanup();
    return 0;
}
