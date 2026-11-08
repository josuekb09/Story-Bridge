// Cultures and places shown on the landing page.
// Owner: Claude (see docs/COLLAB.md). Text here is deliberately short and factual:
// it names a place, a country and the subject of a photo. It does not describe
// beliefs, rituals or meanings; those belong to community stories with sources.
//
// `commons` is the Wikimedia Commons search used by scripts/fetch-africa-images.mjs.
// `pin` (optional) is an exact Commons file title, set after a human review of the
// manifest so the same image is fetched every time.
// `local` points to an image already in the repo (used without fetching).

export const REGIONS = ['North Africa', 'West Africa', 'Central Africa', 'East Africa', 'Southern Africa'];

export const SHOWCASE = [
  { id: 'za-table-mountain', country: 'South Africa', countryCode: 'ZA', region: 'Southern Africa', culture: 'Cape Town', subject: 'Table Mountain above Cape Town', commons: ['Table Mountain Cape Town Bloubergstrand', 'Table Mountain Cape Town', 'Tafelberg Kaapstad'], hero: true },
  { id: 'za-ndebele-murals', country: 'South Africa', countryCode: 'ZA', region: 'Southern Africa', culture: 'Ndebele', subject: 'Painted Ndebele homestead walls', commons: ['Ndebele house painting', 'Ndebele painted house', 'Ndebele mural', 'Botshabelo Ndebele', 'Ndebele wall art'], minWidth: 1000, hero: true },
  { id: 'za-zulu-beadwork', country: 'South Africa', countryCode: 'ZA', region: 'Southern Africa', culture: 'Zulu', subject: 'Zulu beadwork', commons: ['Zulu beadwork', 'Zulu beads', 'Zulu beaded necklace', 'Brooklyn Museum Zulu', 'Zulu beadwork collection'], minWidth: 800, hero: false },
  { id: 'cd-luluwa-figure', country: 'DR Congo', countryCode: 'CD', region: 'Central Africa', culture: 'Luluwa (Kasai)', subject: 'Luluwa figure, Ethnologisches Museum Berlin', local: { src: '/assets/photos/lulua/web/Statue_Luluwa-Musée_ethnologique_de_Berlin.jpg', width: 1200, height: 1600, author: 'Ji-Elle', licence: 'CC BY-SA 3.0', licenceUrl: 'https://creativecommons.org/licenses/by-sa/3.0/', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Statue_Luluwa-Mus%C3%A9e_ethnologique_de_Berlin.jpg', title: 'Statue Luluwa-Musée ethnologique de Berlin.jpg' }, hero: true },
  { id: 'cd-kuba-textile', country: 'DR Congo', countryCode: 'CD', region: 'Central Africa', culture: 'Kuba', subject: 'Kuba raffia textile', commons: ['Kuba textile', 'Kuba raffia cloth', 'Kuba cloth Shoowa'], minWidth: 1000, hero: false },
  { id: 'et-lalibela', country: 'Ethiopia', countryCode: 'ET', region: 'East Africa', culture: 'Lalibela', subject: 'Church of Saint George, Lalibela', commons: ['Bete Giyorgis Lalibela', 'Church of Saint George Lalibela', 'Lalibela rock church'], hero: true },
  { id: 'tz-zanzibar-door', country: 'Tanzania', countryCode: 'TZ', region: 'East Africa', culture: 'Swahili coast', subject: 'Carved door, Stone Town, Zanzibar', commons: ['Zanzibar carved door Stone Town', 'Zanzibar door'], hero: false },
  { id: 'ke-nairobi', country: 'Kenya', countryCode: 'KE', region: 'East Africa', culture: 'Nairobi', subject: 'Nairobi skyline', commons: ['Nairobi skyline', 'Nairobi skyline night', 'Nairobi Central Business District', 'Kenyatta International Convention Centre', 'Nairobi from Uhuru Park'], hero: true },
  { id: 'ml-djenne', country: 'Mali', countryCode: 'ML', region: 'West Africa', culture: 'Djenné', subject: 'Great Mosque of Djenné', commons: ['Great Mosque of Djenné', 'Grande mosquée de Djenné', 'Djenne mosque'], hero: true },
  { id: 'gh-kente', country: 'Ghana', countryCode: 'GH', region: 'West Africa', culture: 'Asante and Ewe', subject: 'Kente cloth', commons: ['Kente cloth', 'Kente Ghana', 'Kente textile'], minWidth: 1000, hero: false },
  { id: 'ng-lagos', country: 'Nigeria', countryCode: 'NG', region: 'West Africa', culture: 'Lagos', subject: 'Lekki–Ikoyi Link Bridge, Lagos', commons: ['Lekki Ikoyi Link Bridge', 'Lekki-Ikoyi bridge Lagos', 'Lagos skyline'], hero: true },
  { id: 'ma-ait-benhaddou', country: 'Morocco', countryCode: 'MA', region: 'North Africa', culture: 'Amazigh', subject: 'Ksar of Aït Benhaddou', commons: ['Ait Benhaddou', 'Aït-Ben-Haddou ksar', 'Ait Ben Haddou'], hero: true },
  { id: 'mg-baobabs', country: 'Madagascar', countryCode: 'MG', region: 'Southern Africa', culture: 'Menabe', subject: 'Avenue of the Baobabs, Morondava', commons: ['Avenue of the Baobabs', 'Allée des Baobabs Morondava', 'Baobab alley Madagascar'], hero: true },
  { id: 'zw-great-zimbabwe', country: 'Zimbabwe', countryCode: 'ZW', region: 'Southern Africa', culture: 'Shona', subject: 'Great Enclosure, Great Zimbabwe', commons: ['Great Zimbabwe Great Enclosure', 'Great Zimbabwe', 'Great Zimbabwe ruins'], hero: false },
];
