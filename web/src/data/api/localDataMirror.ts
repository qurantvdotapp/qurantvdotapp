// Fallback / local mirror mappings when offline or before CDN sync
export const EMBEDDED_TIMING_SERVERS: Record<string, { read_id: number; slug: string; surahs: "all" | number[] }> = {
  "https://server16.mp3quran.net/a_maasaraawi/Rewayat-Hafs-A-n-Assem/": {
    read_id: 278,
    slug: "qurantvapp-ahmad-issa-al-maas-hafs-murattal",
    surahs: "all",
  },
  "https://server16.mp3quran.net/soufi/Rewayat-Hafs-A-n-Assem/": {
    read_id: 64,
    slug: "qurantvapp-abdulrasheed-soufi-hafs-murattal",
    surahs: "all",
  },
  "https://server16.mp3quran.net/a_turki/Rewayat-Hafs-A-n-Assem/": {
    read_id: 79,
    slug: "qurantvapp-abdulaziz-alturki-hafs-murattal",
    surahs: "all",
  },
  "https://server9.mp3quran.net/hthfi/Rewayat-Sho-bah-A-n-Asim/": {
    read_id: 305,
    slug: "qurantvapp-ali-alhuthaifi-shuba-murattal",
    surahs: "all",
  },
  "https://server8.mp3quran.net/majd_onazi/": {
    read_id: 100,
    slug: "qurantvapp-majed-al-enezi-hafs-murattal",
    surahs: "all",
  },
  "https://server8.mp3quran.net/jbrl/": {
    read_id: 111,
    slug: "qurantvapp-mohammed-jibreel-hafs-murattal",
    surahs: "all",
  },
  "https://server16.mp3quran.net/i_sanankoua/Rewayat-Hafs-A-n-Assem/": {
    read_id: 303,
    slug: "qurantvapp-issa-omar-sanankou-hafs",
    surahs: "all",
  },
  "https://server16.mp3quran.net/s_hashemi/Rewayat-Hafs-A-n-Assem/": {
    read_id: 294,
    slug: "qurantvapp-sayed-ahmad-hashem-hafs",
    surahs: "all",
  },
  "https://server13.mp3quran.net/braak/": {
    read_id: 105,
    slug: "qurantvapp-mohammed-al-barrak-hafs-murattal",
    surahs: [1, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114],
  },
};
