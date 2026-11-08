export const OBJECT_RECORDS = Object.freeze([
  Object.freeze({
    id: 'luluwa-project-draft',
    title: 'Luluwa (Lulua) people: art and history',
    whatItIs: 'A cultural record about Luluwa people and art, including sculptural traditions and the Luba lukasa memory board.',
    people: 'Luluwa (Lulua) people; described in the cited sources in relation to Luba groups of Kasai. Community confirmation is needed.',
    region: 'southern-central Kasai-Occidental province, DR Congo.',
    holderToday: 'Not yet verified. Confirm with a Luluwa community contributor before treating this record as complete.',
    maker: '', date: '', material: '', technique: '', sourceOfInformation: 'Wikipedia (fr), “Luluwa (peuple)”; Wikipedia (en), “Luba art”; Wikipedia (en), “Luba people”.',
    imageLicence: '', image: null, access: 'Public', projectDraft: true,
    attribution: 'Project draft; not written by a community member.',
    summary: Object.freeze({
      en: 'The Luluwa are a subgroup of the Luba of Kasai, close to the Bakwa-luntu and Baluba-lubilanji. Their sculptures are known for their plastic qualities, showing human figures with fully scarified bodies. Masks are rarer. The Luba produced the lukasa memory board, used to record royal history, migrations and genealogies.',
      fr: '', tshiluba: ''
    }),
    sources: Object.freeze([
      Object.freeze({ label: 'Wikipedia (fr): Luluwa (peuple)', url: 'https://fr.wikipedia.org/wiki/Luluwa_(peuple)' }),
      Object.freeze({ label: 'Wikipedia (en): Luba art', url: 'https://en.wikipedia.org/wiki/Luba_art' }),
      Object.freeze({ label: 'Wikipedia (en): Luba people', url: 'https://en.wikipedia.org/wiki/Luba_people' })
    ])
  })
]);

export function objectRecordView(record, { owner = false } = {}) {
  if (record.access !== 'Restricted to a community' || owner) return record;
  return { id: record.id, title: record.title, region: record.region, access: record.access, communityNote: 'This object is shared with its community.' };
}

// The object association is presentation metadata; the existing story object,
// author and server-generated version fingerprints remain unchanged.
export function attachStoryToObject(recordId, story) {
  return { objectId: recordId, story };
}
