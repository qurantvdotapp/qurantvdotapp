import json

with open("web/data-mirror/timing/reads.json", "r", encoding="utf-8") as f:
    reads = json.load(f)

timed_folders = {r["folder_url"].rstrip("/") + "/" for r in reads if "folder_url" in r}

with open("web/data-mirror/catalog/reciters_ar.json", "r", encoding="utf-8") as f:
    catalog = json.load(f)

untimed = []
for r in catalog.get("reciters", []):
    for m in r.get("moshaf", []):
        server = m.get("server", "").rstrip("/") + "/"
        if server not in timed_folders:
            untimed.append({
                "reciter_id": r["id"],
                "reciter_name": r["name"],
                "moshaf_id": m["id"],
                "moshaf_name": m["name"],
                "server": server,
                "surah_list": m.get("surah_list")
            })

print(f"Total untimed moshafs: {len(untimed)}")
for u in untimed[:10]:
    print(f"- {u['reciter_name']} (ID {u['reciter_id']}): {u['moshaf_name']} -> {u['server']}")
