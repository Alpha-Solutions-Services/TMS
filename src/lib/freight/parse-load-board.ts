/** Parse common load-board paste lines without AI (fallback when Groq fails). */

export type ParsedLoadFields = {
  companyName: string;
  loadDetails: string;
  pickupDateTime: string;
  deliveryDateTime: string;
  miles: string;
  loadNumber: string;
  states: string;
  rcInvoice: string;
  broker: string;
  truckTrailer: string;
  notes: string;
};

const CITY_STATE =
  /([A-Za-z][A-Za-z\s.'-]+),\s*([A-Z]{2})/g;

function emptyFields(): ParsedLoadFields {
  return {
    companyName: "",
    loadDetails: "",
    pickupDateTime: "",
    deliveryDateTime: "",
    miles: "",
    loadNumber: "",
    states: "",
    rcInvoice: "",
    broker: "",
    truckTrailer: "",
    notes: "",
  };
}

function formatRate(raw: string): string {
  return raw.replace(/^\$/, "").replace(/,/g, "").trim();
}

/** e.g. $400 Factoring 193 San Angelo, TX (126) Lubbock, TX 7/21 SB 275 lbs 26 ft - Full */
export function parseLoadBoardLine(raw: string): ParsedLoadFields | null {
  const line = raw.replace(/\s+/g, " ").trim();
  if (line.length < 10) return null;

  const fields = emptyFields();
  let rest = line;

  const rateMatch = rest.match(/\$[\d,]+(?:\.\d{2})?/);
  if (rateMatch) {
    fields.rcInvoice = formatRate(rateMatch[0]);
    rest = rest.replace(rateMatch[0], " ").trim();
  }

  const rpmMatch = rest.match(/\$[\d.]+\*?\/mi/i);
  if (rpmMatch) {
    fields.notes = `${rpmMatch[0]}`;
    rest = rest.replace(rpmMatch[0], " ").trim();
  }

  const milesParen = rest.match(/\((\d{1,5})\)/);
  if (milesParen) {
    fields.miles = milesParen[1];
    rest = rest.replace(milesParen[0], " ").trim();
  } else {
    const milesWord = rest.match(/\b(\d{2,5})\s*(?:mi|miles)\b/i);
    if (milesWord) {
      fields.miles = milesWord[1];
    }
  }

  const cities: { city: string; state: string }[] = [];
  let m: RegExpExecArray | null;
  const cityRe = new RegExp(CITY_STATE.source, "g");
  while ((m = cityRe.exec(line)) !== null) {
    cities.push({ city: m[1].trim(), state: m[2] });
  }

  if (cities.length >= 2) {
    const [pickup, delivery] = cities;
    fields.loadDetails = `${pickup.city}, ${pickup.state} → ${delivery.city}, ${delivery.state}`;
    fields.states = `${pickup.state} → ${delivery.state}`;
  } else if (cities.length === 1) {
    fields.loadDetails = `${cities[0].city}, ${cities[0].state}`;
    fields.states = cities[0].state;
  }

  const dateMatch = rest.match(/\b(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/);
  if (dateMatch) fields.pickupDateTime = dateMatch[1];

  const brokerMatch = rest.match(
    /^([A-Za-z][A-Za-z0-9\s&.'-]{1,40}?)(?=\s+\d|\s+[A-Z][a-z])/,
  );
  if (brokerMatch && !brokerMatch[1].match(/^(San|Los|New|Fort)/)) {
    fields.broker = brokerMatch[1].trim();
    fields.companyName = fields.broker;
  }

  const loadNum = rest.match(/\b(?:load|#|ref)?\s*(\d{4,8})\b/i);
  if (loadNum && loadNum[1] !== fields.miles) {
    fields.loadNumber = loadNum[1];
  }

  const equip: string[] = [];
  if (/\bSB\b/i.test(line)) equip.push("SB");
  if (/\bFB\b/i.test(line)) equip.push("Flatbed");
  if (/\bR\b|reefer/i.test(line)) equip.push("Reefer");
  const weight = line.match(/(\d{1,5})\s*lbs/i);
  const length = line.match(/(\d{1,2})\s*ft/i);
  const fullPartial = line.match(/\b(Full|Partial)\b/i);
  if (weight) equip.push(`${weight[1]} lbs`);
  if (length) equip.push(`${length[1]} ft`);
  if (fullPartial) equip.push(fullPartial[1]);

  const noteParts = [
    fields.rcInvoice ? `Rate $${fields.rcInvoice}` : null,
    fields.miles ? `${fields.miles} mi` : null,
    ...equip,
  ].filter(Boolean);

  fields.notes = [fields.notes, noteParts.join(" · ")].filter(Boolean).join(" · ").trim();
  fields.truckTrailer = equip.filter((e) => !e.includes("lbs")).join(" · ");

  if (!fields.loadDetails && !fields.rcInvoice) return null;
  return fields;
}

export function formatLoadSummary(fields: ParsedLoadFields): string {
  return [
    fields.rcInvoice ? `$${fields.rcInvoice}` : null,
    fields.miles ? `${fields.miles} mi` : null,
    fields.loadDetails || null,
    fields.notes || null,
  ]
    .filter(Boolean)
    .join(" · ");
}
